const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../config/db');
const { authenticateToken } = require('../middlewares/auth');
const { webhookLimiter } = require('../middlewares/rateLimiter');
const { sendEmail } = require('../services/email');
const { triggerManualDelivery } = require('../services/delivery');

/**
 * 1. CHECKOUT DO CARRINHO (Criar Pedido)
 */
// Helper para aprovar pedido e enfileirar entrega RCON
async function handleApprovedOrder(order, paymentId) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Atualizar status do pedido
    await client.query(
      "UPDATE orders SET payment_status = 'approved', updated_at = NOW() WHERE id = $1",
      [order.id]
    );

    // Buscar itens do pedido e seus comandos RCON vinculando via variações
    const itemsRes = await client.query(
      `SELECT oi.id as order_item_id, oi.quantity, pv.nome as product_name, pv.comando_rcon, p.categoria as category
       FROM order_items oi
       JOIN produto_variacoes pv ON oi.variation_id = pv.id
       JOIN produtos p ON pv.produto_id = p.id
       WHERE oi.order_id = $1`,
      [order.id]
    );

    const itemsDetailsList = [];

    for (const item of itemsRes.rows) {
      const { order_item_id, quantity, product_name, comando_rcon, category } = item;

      // Se for compra de moedas (Coins/coins), creditamos diretamente o saldo do usuário destinatário no banco
      if (category.toLowerCase() === 'coins' || category.toLowerCase() === 'moedas' || product_name.toLowerCase().includes('moedas')) {
        let targetUserId = order.user_id;
        
        if (order.is_gift) {
          const findUser = await client.query('SELECT id FROM users WHERE ark_id = $1', [order.recipient_ark_id]);
          if (findUser.rows.length > 0) {
            targetUserId = findUser.rows[0].id;
          }
        }
        
        // Extrair o multiplicador de moedas da RCON configurada (ex: "addpoints {ARK_ID} 1000")
        const coinMatch = comando_rcon.match(/addpoints\s+\{ARK_ID\}\s+(\d+)/i);
        const coinsToAdd = coinMatch ? parseInt(coinMatch[1], 10) * quantity : 1000 * quantity;

        await client.query(
          'UPDATE users SET coins_balance = coins_balance + $1 WHERE id = $2',
          [coinsToAdd, targetUserId]
        );

        console.log(`[handleApprovedOrder] Creditadas ${coinsToAdd} moedas para o usuário ID ${targetUserId}`);
      }

      // Se for VIP, atualizamos a flag VIP do usuário destinatário no banco
      if (category.toLowerCase() === 'vip' || product_name.toLowerCase().includes('vip')) {
        let targetUserId = order.user_id;
        if (order.is_gift) {
          const findUser = await client.query('SELECT id FROM users WHERE ark_id = $1', [order.recipient_ark_id]);
          if (findUser.rows.length > 0) {
            targetUserId = findUser.rows[0].id;
          }
        }

        // Ex: "setvip {ARK_ID} gold 30" -> VIP Ouro por 30 dias
        const vipMatch = comando_rcon.match(/setvip\s+\{ARK_ID\}\s+(\w+)\s+(\d+)/i);
        let vipName = 'VIP Bronze';
        let discountPercent = 10;
        let days = 30;
        
        if (vipMatch) {
          const matchedTier = vipMatch[1].toLowerCase();
          if (matchedTier === 'prata' || matchedTier === 'silver') {
            vipName = 'VIP Prata';
            discountPercent = 30;
          } else if (matchedTier === 'ouro' || matchedTier === 'gold') {
            vipName = 'VIP Ouro';
            discountPercent = 50;
          }
          days = parseInt(vipMatch[2], 10);
        } else {
          // Fallback baseado no nome do produto
          if (product_name.toLowerCase().includes('prata')) {
            vipName = 'VIP Prata';
            discountPercent = 30;
          } else if (product_name.toLowerCase().includes('ouro')) {
            vipName = 'VIP Ouro';
            discountPercent = 50;
          }
        }

        await client.query(
          `UPDATE users 
           SET vip_status = $1, vip_expires_at = NOW() + INTERVAL '${days} days', vip_discount_percent = $2 
           WHERE id = $3`,
          [vipName, discountPercent, targetUserId]
        );
      }

      // Inserir os comandos na fila de entrega RCON (apenas para dinos e itens/recursos)
      const isVip = category.toLowerCase() === 'vip' || product_name.toLowerCase().includes('vip');
      const isCoins = category.toLowerCase() === 'coins' || category.toLowerCase() === 'moedas' || product_name.toLowerCase().includes('moedas');

      if (!isVip && !isCoins && comando_rcon && comando_rcon.trim() !== '') {
        const resolvedCommand = comando_rcon.replace(/{ARK_ID}/g, order.recipient_ark_id);

        // Criar uma fila para cada quantidade do item
        for (let i = 0; i < quantity; i++) {
          await client.query(
            `INSERT INTO delivery_queue (order_item_id, recipient_ark_id, rcon_command, status)
             VALUES ($1, $2, $3, 'pending')`,
            [order_item_id, order.recipient_ark_id, resolvedCommand]
          );
        }
      }

      itemsDetailsList.push(`${quantity}x ${product_name}`);
    }

    await client.query('COMMIT');
    client.release();

    // Enviar E-mail de Pagamento Aprovado e Recibo
    if (order.user_email) {
      const emailSubject = `✅ Punisher ARK - Pagamento Aprovado! Pedido #${order.id.substring(0, 8)}`;
      const emailBody = `
        <h2>Oba! Seu pagamento foi confirmado!</h2>
        <p>Seu pedido foi aprovado com sucesso no nosso sistema.</p>
        <p><strong>Detalhes da Compra:</strong></p>
        <ul>
          ${itemsDetailsList.map(itemStr => `<li>${itemStr}</li>`).join('')}
        </ul>
        <p><strong>Destinatário (ARK ID):</strong> <code>${order.recipient_ark_id}</code></p>
        <p><strong>Total Pago:</strong> R$ ${parseFloat(order.total_amount).toFixed(2)}</p>
        <p><strong>Processo de Entrega:</strong> Os itens foram enfileirados e estão sendo entregues via RCON diretamente no seu personagem no servidor de jogo. Verifique o seu inventário no jogo em alguns instantes!</p>
      `;
      await sendEmail(order.user_email, emailSubject, emailBody).catch(e =>
        console.error('[handleApprovedOrder EMAIL ERROR]', e.message)
      );
    }

    // Acionar a fila de entrega RCON imediatamente
    triggerManualDelivery();

  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    console.error('[handleApprovedOrder TRANSACTION ERROR]', err.message);
    throw err;
  }
}

/**
 * 1. CHECKOUT DO CARRINHO (Criar Pedido Localmente)
 */
router.post('/checkout', authenticateToken, async (req, res) => {
  const { items, is_gift, recipient_ark_id } = req.body;
  const userId = req.user.id;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Carrinho de compras vazio.' });
  }

  // Definir o ID ARK de destino
  let targetArkId = '';
  if (is_gift) {
    if (!recipient_ark_id || recipient_ark_id.trim() === '') {
      return res.status(400).json({ error: 'Para compras como presente, informe o ID ARK do destinatário.' });
    }
    targetArkId = recipient_ark_id.trim();
  } else {
    if (!req.user.ark_id) {
      return res.status(400).json({ 
        error: 'Você precisa vincular seu ID ARK ao seu perfil antes de comprar para si mesmo.' 
      });
    }
    targetArkId = req.user.ark_id;
  }

  // Obter e verificar status VIP atualizado do banco
  let activeDiscountPercent = 0;
  try {
    const userRes = await db.query(
      'SELECT vip_status, vip_expires_at, vip_discount_percent FROM users WHERE id = $1',
      [userId]
    );
    if (userRes.rows.length > 0) {
      const dbUser = userRes.rows[0];
      activeDiscountPercent = dbUser.vip_discount_percent || 0;
      
      // Verificar expiração
      if (dbUser.vip_status && dbUser.vip_status !== 'Membro' && dbUser.vip_expires_at && new Date() > new Date(dbUser.vip_expires_at)) {
        console.log(`[CHECKOUT] VIP expirado para o usuário ${userId}. Revertendo para Membro.`);
        await db.query(
          "UPDATE users SET vip_status = 'Membro', vip_discount_percent = 0, vip_expires_at = NULL WHERE id = $1",
          [userId]
        );
        activeDiscountPercent = 0;
      }
    }
  } catch (err) {
    console.error('[CHECKOUT VIP CHECK ERROR]', err.message);
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    let totalAmount = 0;
    const resolvedItems = [];

    // Validar limites e carregar preços das variações
    for (const cartItem of items) {
      const { variationId, quantity } = cartItem;
      const qty = parseInt(quantity, 10);
      const varId = parseInt(variationId, 10);

      if (isNaN(qty) || qty <= 0 || isNaN(varId)) {
        throw new Error('Quantidade ou variação de produto inválida.');
      }

      // Buscar variação juntamente com categoria do produto pai
      const varRes = await client.query(
        `SELECT pv.*, p.nome as parent_name, p.categoria as category, p.slug
         FROM produto_variacoes pv
         JOIN produtos p ON pv.produto_id = p.id
         WHERE pv.id = $1 AND pv.ativo = TRUE`,
        [varId]
      );

      if (varRes.rows.length === 0) {
        throw new Error('Uma ou mais variações selecionadas não estão disponíveis.');
      }

      const variation = varRes.rows[0];

      // Validar limites de compra por jogador
      if (variation.purchase_limit > 0) {
        const historyRes = await client.query(
          `SELECT COALESCE(SUM(oi.quantity), 0) as purchased_qty 
           FROM order_items oi 
           JOIN orders o ON oi.order_id = o.id 
           WHERE o.payment_status = 'approved' AND o.recipient_ark_id = $1 AND oi.variation_id = $2`,
          [targetArkId, varId]
        );
        
        const purchasedQty = parseInt(historyRes.rows[0].purchased_qty, 10);
        if (purchasedQty + qty > variation.purchase_limit) {
          throw new Error(
            `Limite de compra excedido para "${variation.nome}". Limite por jogador: ${variation.purchase_limit}. Você já possui/comprou ${purchasedQty}.`
          );
        }
      }

      // Calcular preço unitário final da variação com desconto se elegível
      let itemPrice = parseFloat(variation.valor);
      if (activeDiscountPercent > 0 && variation.permite_desconto) {
        const discountFactor = (100 - activeDiscountPercent) / 100;
        itemPrice = parseFloat((itemPrice * discountFactor).toFixed(2));
      }

      totalAmount += itemPrice * qty;
      resolvedItems.push({
        variation,
        quantity: qty,
        price: itemPrice
      });
    }

    // Inserir pedido com um payment_id provisório
    const paymentId = 'mp_pay_' + crypto.randomBytes(8).toString('hex');
    const orderInsert = await client.query(
      `INSERT INTO orders (user_id, is_gift, recipient_ark_id, payment_status, payment_id, total_amount)
       VALUES ($1, $2, $3, 'pending', $4, $5)
       RETURNING id`,
      [userId, is_gift, targetArkId, paymentId, totalAmount]
    );

    const orderId = orderInsert.rows[0].id;

    // Inserir itens do pedido
    for (const item of resolvedItems) {
      await client.query(
        `INSERT INTO order_items (order_id, variation_id, quantity, price)
         VALUES ($1, $2, $3, $4)`,
        [orderId, item.variation.id, item.quantity, item.price]
      );
    }

    await client.query('COMMIT');
    client.release();

    res.status(201).json({
      message: 'Pedido criado com sucesso! Prossiga para os dados de pagamento.',
      orderId,
      totalAmount
    });

  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    console.error('[CHECKOUT ERROR]', err.message);
    res.status(400).json({ error: err.message || 'Erro ao processar checkout.' });
  }
});

/**
 * 2. PROCESSAR PAGAMENTO (Mercado Pago Transparent Checkout)
 */
router.post('/process-payment', authenticateToken, async (req, res) => {
  const { orderId, paymentData } = req.body;
  const userId = req.user.id;

  if (!orderId || !paymentData) {
    return res.status(400).json({ error: 'Dados insuficientes para processar o pagamento.' });
  }

  try {
    // 1. Obter pedido do banco e verificar permissão
    const orderRes = await db.query(
      `SELECT o.*, u.email as user_email, u.username as user_name 
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       WHERE o.id = $1 AND o.user_id = $2`,
      [orderId, userId]
    );

    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    const order = orderRes.rows[0];
    if (order.payment_status === 'approved') {
      return res.status(400).json({ error: 'Este pedido já está pago.' });
    }

    // 2. Obter credenciais do Mercado Pago configuradas no banco de dados
    const configRes = await db.query(
      "SELECT value FROM server_config WHERE key = 'mercado_pago_access_token'"
    );
    let accessToken = configRes.rows[0] ? configRes.rows[0].value : '';

    // Fallback para variável de ambiente se o token no banco for vazio ou mock
    if (!accessToken || accessToken.includes('mock')) {
      accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN || accessToken;
    }

    // 3. Fallback de Simulação / Mock se não houver token real configurado
    if (!accessToken || accessToken.includes('mock')) {
      console.log('[PROCESS PAYMENT] Usando fallback Mock/Simulado');
      const mockPaymentId = 'mp_pay_' + crypto.randomBytes(8).toString('hex');
      
      // Salvar payment ID no pedido
      await db.query('UPDATE orders SET payment_id = $1 WHERE id = $2', [mockPaymentId, order.id]);

      if (paymentData.payment_method_id === 'pix') {
        const pixCopyPaste = `00020101021226830014br.gov.bcb.pix2561api.mercadopago.com/v1/pix/${mockPaymentId}5204000053039865405${parseFloat(order.total_amount).toFixed(2)}5802BR5912Punisher ARK6009Sao Paulo62070503***6304`;
        return res.status(200).json({
          status: 'pending',
          payment_id: mockPaymentId,
          qr_code: pixCopyPaste,
          qr_code_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
        });
      } else if (paymentData.payment_method_id === 'bolbradesco' || paymentData.payment_method_id === 'pec') {
        return res.status(200).json({
          status: 'pending',
          payment_id: mockPaymentId,
          ticket_url: 'https://www.mercadopago.com.br'
        });
      } else {
        // Cartão (Aprova imediatamente na simulação)
        await handleApprovedOrder(order, mockPaymentId);
        return res.status(200).json({
          status: 'approved',
          payment_id: mockPaymentId
        });
      }
    }

    // 4. Integração Real com Mercado Pago Checkout Transparente
    const payload = {
      ...paymentData,
      transaction_amount: parseFloat(parseFloat(order.total_amount).toFixed(2)),
      description: `Compra Punisher ARK - Pedido #${order.id.substring(0, 8)}`,
    };

    // Caso o payer não tenha e-mail, forçar e-mail da sessão
    if (!payload.payer) payload.payer = {};
    if (!payload.payer.email) payload.payer.email = order.user_email;

    const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': order.id
      },
      body: JSON.stringify(payload)
    });

    const mpData = await mpRes.json();

    if (mpData && mpData.id) {
      const realPaymentId = String(mpData.id);
      const mpStatus = mpData.status; // approved, pending, in_process, rejected

      // Atualizar o pedido com o payment ID real do Mercado Pago
      await db.query(
        'UPDATE orders SET payment_id = $1, payment_status = $2, updated_at = NOW() WHERE id = $3',
        [realPaymentId, mpStatus, order.id]
      );

      if (mpStatus === 'approved') {
        // Processar entrega imediatamente
        await handleApprovedOrder(order, realPaymentId);
        return res.status(200).json({
          status: 'approved',
          payment_id: realPaymentId
        });
      } else if (mpStatus === 'pending' || mpStatus === 'in_process') {
        let qr_code = '';
        let qr_code_base64 = '';
        let ticket_url = '';

        if (mpData.point_of_interaction && mpData.point_of_interaction.transaction_data) {
          qr_code = mpData.point_of_interaction.transaction_data.qr_code;
          qr_code_base64 = mpData.point_of_interaction.transaction_data.qr_code_base64;
          ticket_url = mpData.point_of_interaction.transaction_data.ticket_url;
        }

        return res.status(200).json({
          status: mpStatus,
          payment_id: realPaymentId,
          qr_code,
          qr_code_base64,
          ticket_url
        });
      } else {
        return res.status(200).json({
          status: mpStatus,
          payment_id: realPaymentId,
          error: mpData.status_detail || 'Pagamento recusado.'
        });
      }
    } else {
      console.error('[MERCADO PAGO PROCESS ERROR]', mpData);
      return res.status(400).json({
        error: (mpData.cause && mpData.cause[0] && mpData.cause[0].description) || mpData.message || 'Erro ao processar pagamento com o Mercado Pago.'
      });
    }
  } catch (err) {
    console.error('[PROCESS PAYMENT ERROR]', err.message);
    res.status(500).json({ error: 'Erro interno do servidor ao processar pagamento.' });
  }
});

/**
 * 3. WEBHOOK DO MERCADO PAGO (Confirmação de Pagamento Assíncrona)
 */
router.post('/webhook', webhookLimiter, async (req, res) => {
  const paymentId = req.body.data ? req.body.data.id : req.body.payment_id;
  const mpStatus = req.body.status;

  if (!paymentId) {
    return res.status(400).json({ error: 'ID de pagamento não informado.' });
  }

  console.log(`[WEBHOOK] Notificação de pagamento recebida. ID: ${paymentId}`);

  try {
    // Buscar configurações de credenciais
    const configRes = await db.query(
      "SELECT value FROM server_config WHERE key = 'mercado_pago_access_token'"
    );
    let accessToken = configRes.rows[0] ? configRes.rows[0].value : '';

    // Fallback para variável de ambiente se o token no banco for vazio ou mock
    if (!accessToken || accessToken.includes('mock')) {
      accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN || accessToken;
    }

    // Verificar se o pedido correspondente existe
    const orderRes = await db.query(
      `SELECT o.*, u.email as user_email, u.username as user_name 
       FROM orders o 
       LEFT JOIN users u ON o.user_id = u.id 
       WHERE o.payment_id = $1`,
      [paymentId]
    );

    if (orderRes.rows.length === 0) {
      return res.status(200).json({ message: 'Pedido correspondente não encontrado localmente (ignorado).' });
    }

    const order = orderRes.rows[0];

    if (order.payment_status === 'approved') {
      return res.status(200).json({ message: 'Pedido já processado anteriormente.' });
    }

    let resolvedStatus = 'approved';

    // Se as credenciais reais do Mercado Pago estiverem ativas, consultamos na API real
    if (accessToken && !accessToken.includes('mock-token') && !paymentId.startsWith('mp_pay_')) {
      try {
        const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const mpData = await mpRes.json();
        
        if (mpData && mpData.status) {
          resolvedStatus = mpData.status;
        }
      } catch (err) {
        console.error('[WEBHOOK] Erro ao consultar pagamento na API real do Mercado Pago:', err.message);
        return res.status(500).json({ error: 'Erro ao validar transação no provedor.' });
      }
    } else {
      if (mpStatus) {
        resolvedStatus = mpStatus;
      }
    }

    console.log(`[WEBHOOK] Status resolvido para pagamento ${paymentId}: ${resolvedStatus}`);

    if (resolvedStatus === 'approved') {
      await handleApprovedOrder(order, paymentId);
    } else {
      await db.query(
        'UPDATE orders SET payment_status = $2, updated_at = NOW() WHERE id = $1',
        [order.id, resolvedStatus]
      );
    }

    res.status(200).json({ message: 'Webhook processado com sucesso.' });
  } catch (err) {
    console.error('[WEBHOOK GENERAL ERROR]', err.message);
    res.status(500).json({ error: 'Erro interno no webhook.' });
  }
});

/**
 * 3. HISTÓRICO DE PEDIDOS DO JOGADOR LOGADO
 */
router.get('/history', authenticateToken, async (req, res) => {
  const userId = req.user.id;

  try {
    const queryStr = `
      SELECT o.id, o.is_gift, o.recipient_ark_id, o.payment_status, o.total_amount, o.created_at,
             COALESCE(
               JSON_AGG(
                 JSON_BUILD_OBJECT(
                   'product_name', pv.nome,
                   'quantity', oi.quantity,
                   'price', oi.price,
                   'delivery_status', (
                      SELECT dq.status 
                      FROM delivery_queue dq 
                      WHERE dq.order_item_id = oi.id 
                      LIMIT 1
                   )
                 )
               ), '[]'
             ) as items
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN produto_variacoes pv ON oi.variation_id = pv.id
      WHERE o.user_id = $1
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `;

    const historyRes = await db.query(queryStr, [userId]);
    res.status(200).json({ orders: historyRes.rows });
  } catch (err) {
    console.error('[ORDER HISTORY ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao recuperar histórico de compras.' });
  }
});

router.handleApprovedOrder = handleApprovedOrder;
module.exports = router;
