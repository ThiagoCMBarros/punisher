const nodemailer = require('nodemailer');
const db = require('../config/db');

/**
 * Envia um e-mail transacional em formato HTML.
 * Busca as configurações de SMTP no banco de dados e possui um fallback seguro para
 * log no console em caso de credenciais em branco ou erros de conexão com o servidor de e-mail.
 */
async function sendEmail(to, subject, htmlContent) {
  // Buscar credenciais atualizadas de SMTP no banco
  let configs;
  try {
    configs = await db.query(
      "SELECT key, value FROM server_config WHERE key IN ('email_host', 'email_port', 'email_user', 'email_pass', 'email_from')"
    );
  } catch (err) {
    console.error('[EMAIL] Erro ao buscar configurações de e-mail no banco:', err.message);
    configs = { rows: [] };
  }

  const configMap = {};
  configs.rows.forEach(row => {
    configMap[row.key] = row.value;
  });

  const host = configMap['email_host'] || process.env.EMAIL_HOST || 'smtp.mailtrap.io';
  const port = parseInt(configMap['email_port'] || process.env.EMAIL_PORT || '2525', 10);
  const user = configMap['email_user'] || process.env.EMAIL_USER || '';
  const pass = configMap['email_pass'] || process.env.EMAIL_PASS || '';
  const from = configMap['email_from'] || process.env.EMAIL_FROM || 'no-reply@punisherbrasil.com.br';

  console.log(`[EMAIL] Disparando e-mail para ${to}...`);

  // Fallback se as credenciais de SMTP não existirem ou forem as padrões de teste não configuradas
  if (!user || !pass || user === 'mock_user' || user === '') {
    console.log(`[EMAIL SIMULADO] Envio local/desenvolvimento:`);
    console.log(`========================================================`);
    console.log(`DE: Punisher ARK <${from}>`);
    console.log(`PARA: ${to}`);
    console.log(`ASSUNTO: ${subject}`);
    console.log(`CONTEÚDO (Texto Limpo):\n${htmlContent.replace(/<[^>]*>/g, '').trim()}`);
    console.log(`========================================================`);
    return { mock: true };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false // Evita erros de certificados SSL não confiáveis de SMTP
    }
  });

  try {
    const info = await transporter.sendMail({
      from: `Punisher ARK Server <${from}>`,
      to,
      subject,
      html: `
        <div style="background-color: #0b0c10; color: #c5c6c7; font-family: 'Segoe UI', Arial, sans-serif; padding: 25px; max-width: 600px; margin: 0 auto; border: 1px solid #1f2833; border-radius: 8px;">
          <div style="text-align: center; border-bottom: 2px solid #00ffc4; padding-bottom: 15px;">
            <h1 style="color: #00ffc4; margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 2px;">🎮 PUNISHER ARK</h1>
          </div>
          <div style="padding: 20px 0; font-size: 16px; line-height: 1.6; color: #e0e0e0;">
            ${htmlContent}
          </div>
          <div style="border-top: 1px solid #1f2833; padding-top: 15px; text-align: center; font-size: 12px; color: #888;">
            Este é um e-mail transacional do site Punisher ARK Survival Ascended.<br>
            Não responda a esta mensagem.
          </div>
        </div>
      `
    });

    console.log(`[EMAIL] E-mail enviado com sucesso! Message-ID: ${info.messageId}`);
    return info;
  } catch (err) {
    console.error(`[EMAIL ERROR] Falha ao enviar via SMTP real (${host}:${port}):`, err.message);
    
    // Fallback secundário após erro real
    console.log(`[EMAIL FALLBACK LOG] Conteúdo do e-mail falhado para [${to}]:`);
    console.log(`ASSUNTO: ${subject}`);
    console.log(`CORPO:\n${htmlContent.replace(/<[^>]*>/g, '').trim()}`);
    return { mock: true, error: err.message };
  }
}

module.exports = {
  sendEmail
};
