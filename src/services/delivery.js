const db = require('../config/db');
const { sendRconCommand } = require('./rcon');
const { sendEmail } = require('./email');

let isProcessing = false;

/**
 * Processa a fila de entregas pendentes
 */
async function processDeliveryQueue() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    // Buscar entregas pendentes ou falhas que tenham menos de 5 tentativas
    const queryStr = `
      SELECT dq.*, u.email as user_email, u.username as user_name, pv.nome as product_name
      FROM delivery_queue dq
      JOIN order_items oi ON dq.order_item_id = oi.id
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN users u ON o.user_id = u.id
      JOIN produto_variacoes pv ON oi.variation_id = pv.id
      WHERE dq.status IN ('pending', 'error') AND dq.attempts < 5
      ORDER BY dq.created_at ASC
    `;
    
    const res = await db.query(queryStr);
    
    if (res.rows.length === 0) {
      isProcessing = false;
      return;
    }

    console.log(`[DELIVERY WORKER] Processando ${res.rows.length} entregas na fila...`);

    let itemIndex = 0;
    for (const item of res.rows) {
      if (itemIndex > 0) {
        console.log(`[DELIVERY WORKER] Aguardando 3 segundos de cooldown RCON antes da próxima entrega...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      itemIndex++;

      const { id, recipient_ark_id, rcon_command, attempts, product_name, user_email, user_name } = item;
      
      console.log(`[DELIVERY WORKER] Tentando entregar item "${product_name}" para ARK ID: ${recipient_ark_id} (Tentativa ${attempts + 1}/5)`);
      
      // Atualizar tentativa e data
      await db.query(
        'UPDATE delivery_queue SET attempts = attempts + 1, last_attempt_at = NOW() WHERE id = $1',
        [id]
      );

      try {
        // Enviar via RCON
        const response = await sendRconCommand(rcon_command);

        // Sucesso! Atualizar status
        await db.query(
          "UPDATE delivery_queue SET status = 'delivered', error_log = $2 WHERE id = $1",
          [id, `Sucesso: ${response.substring(0, 500)}`]
        );

        console.log(`[DELIVERY WORKER] Entrega concluída com sucesso para ARK ID: ${recipient_ark_id}`);

        // Enviar e-mail de confirmação de entrega concluída
        if (user_email) {
          const emailSubject = `🎮 Punisher ARK - Seu item foi entregue no jogo!`;
          const emailBody = `
            <h2>Olá, ${user_name}!</h2>
            <p>Seu item <strong>${product_name}</strong> foi entregue com sucesso no servidor do jogo para o ID de Jogador ARK: <strong>${recipient_ark_id}</strong>.</p>
            <p><strong>Comando Executado:</strong> <code>${rcon_command}</code></p>
            <p>Aproveite a jogatina!</p>
            <br>
            <hr>
            <p style="font-size: 0.8em; color: #666;">Punisher ARK Server Team.</p>
          `;
          await sendEmail(user_email, emailSubject, emailBody).catch(err => 
            console.error('[DELIVERY WORKER] Erro ao enviar e-mail de entrega:', err.message)
          );
        }

      } catch (err) {
        console.error(`[DELIVERY WORKER] Falha na entrega para ARK ID ${recipient_ark_id}:`, err.message);
        
        const nextStatus = (attempts + 1) >= 5 ? 'error' : 'pending';
        
        await db.query(
          'UPDATE delivery_queue SET status = $2, error_log = $3 WHERE id = $1',
          [id, nextStatus, err.message]
        );

        // Se atingiu o limite de tentativas, avisa o usuário para entrar em contato com o suporte
        if (nextStatus === 'error' && user_email) {
          const emailSubject = `⚠️ Punisher ARK - Alerta de falha na entrega do produto`;
          const emailBody = `
            <h2>Olá, ${user_name}.</h2>
            <p>Infelizmente, não conseguimos entregar automaticamente o seu produto <strong>${product_name}</strong> para o ID ARK <strong>${recipient_ark_id}</strong> após 5 tentativas.</p>
            <p>Isso geralmente ocorre se o servidor estiver offline para manutenção ou se o ID de jogador estiver incorreto.</p>
            <p><strong>Não se preocupe:</strong> nossa equipe de suporte foi notificada. Você também pode abrir um ticket informando o código da entrega: <code>${id}</code> para que possamos efetuar a entrega manualmente.</p>
            <br>
            <hr>
            <p style="font-size: 0.8em; color: #d63031;">Punisher ARK Server Team - Suporte Técnico</p>
          `;
          await sendEmail(user_email, emailSubject, emailBody).catch(e => 
            console.error('[DELIVERY WORKER] Erro ao enviar e-mail de alerta de falha:', e.message)
          );
        }
      }
    }
  } catch (error) {
    console.error('[DELIVERY WORKER] Erro geral na fila de entrega:', error.message);
  } finally {
    isProcessing = false;
  }
}

/**
 * Inicializa o loop contínuo do processamento de entregas (a cada 30 segundos)
 */
function startDeliveryWorker() {
  console.log('[DELIVERY WORKER] Iniciando executor da fila de entregas RCON (Frequência: 30 segundos)...');
  // Processar imediatamente na inicialização
  setTimeout(processDeliveryQueue, 5000);
  
  // Agendar loop a cada 30 segundos
  setInterval(processDeliveryQueue, 30000);
}

module.exports = {
  startDeliveryWorker,
  triggerManualDelivery: processDeliveryQueue // Permite acionar manualmente no painel admin
};
