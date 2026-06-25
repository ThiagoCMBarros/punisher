const { Rcon } = require('rcon-client');
const db = require('../config/db');

/**
 * Envia um comando RCON para o servidor Nitrado configurado no banco de dados.
 * Caso o IP esteja configurado como localhost/127.0.0.1, simula a execução do comando
 * para fins de teste e demonstração local.
 */
async function sendRconCommand(command) {
  // Buscar configurações atualizadas do banco de dados
  const configs = await db.query(
    "SELECT key, value FROM server_config WHERE key IN ('nitrado_ip', 'nitrado_port', 'nitrado_password')"
  );
  
  const configMap = {};
  configs.rows.forEach(row => {
    configMap[row.key] = row.value;
  });

  const ip = configMap['nitrado_ip'] || '127.0.0.1';
  const port = parseInt(configMap['nitrado_port'] || '27015', 10);
  const password = configMap['nitrado_password'] || '';

  if (!password) {
    throw new Error('A senha do RCON não está configurada no painel administrativo.');
  }

  // Simulador local para evitar falhas em ambiente de desenvolvimento sem servidor ARK real ativo
  if (ip === '127.0.0.1' || ip === 'localhost') {
    console.log(`[RCON MOCK] Simulando comando no RCON: "${command}" em ${ip}:${port}`);
    await new Promise(resolve => setTimeout(resolve, 800)); // Simular latência de rede
    return `[SIMULAÇÃO SUCESSO] Comando executado com sucesso: "${command}". Resposta: Command executed.`;
  }

  console.log(`[RCON] Conectando ao servidor Nitrado em ${ip}:${port}...`);
  const rcon = new Rcon({
    host: ip,
    port: port,
    password: password,
    timeout: 35000 // 35 segundos de timeout para conexão
  });

  let isClosed = false;
  const safeEnd = () => {
    if (isClosed) return;
    isClosed = true;
    try {
      rcon.end(); // Executa em background sem travar o event loop/finally
    } catch (_) {}
  };

  const subCommands = command.split('&&').map(c => c.trim()).filter(Boolean);

  const executePromise = (async () => {
    try {
      await rcon.connect();
      console.log(`[RCON] Conectado! Processando ${subCommands.length} sub-comandos...`);
      
      const responses = [];
      for (let i = 0; i < subCommands.length; i++) {
        if (i > 0) {
          console.log(`[RCON] Aguardando 1.5s antes do próximo sub-comando...`);
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
        console.log(`[RCON] Enviando sub-comando (${i + 1}/${subCommands.length}): "${subCommands[i]}"`);
        const response = await rcon.send(subCommands[i]);
        console.log(`[RCON] Resposta recebida para (${i + 1}/${subCommands.length}): "${response.substring(0, 100)}"`);
        responses.push(response);
      }
      
      return responses.join(' | ');
    } finally {
      safeEnd();
    }
  })();

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Timeout: O servidor ARK/Nitrado não respondeu no tempo limite de 35 segundos.'));
    }, 35000);
  });

  try {
    const response = await Promise.race([executePromise, timeoutPromise]);
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    console.error(`[RCON] Erro na execução do comando no servidor ${ip}:${port}:`, err.message);
    safeEnd();
    throw err;
  }
}

module.exports = {
  sendRconCommand
};
