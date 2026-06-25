const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/db');
const { sendEmail } = require('../services/email');
const { authenticateToken } = require('../middlewares/auth');
const { authLimiter } = require('../middlewares/rateLimiter');

const JWT_SECRET = process.env.JWT_SECRET || 'ark_jwt_secret_token_key_12345';

/**
 * 1. REGISTRO DE USUÁRIO
 */
router.post('/register', authLimiter, async (req, res) => {
  const { username, email, password, character_name, tribe_name } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios (Usuário, E-mail e Senha).' });
  }

  try {
    // Verificar se usuário ou e-mail já existem
    const checkUser = await db.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username.trim().toLowerCase(), email.trim().toLowerCase()]
    );

    if (checkUser.rows.length > 0) {
      return res.status(400).json({ error: 'Nome de usuário ou endereço de e-mail já cadastrados.' });
    }

    // Criar hash da senha
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Gerar token de verificação de e-mail
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Inserir usuário no banco
    const insertRes = await db.query(
      `INSERT INTO users 
        (username, email, password_hash, verification_token, character_name, tribe_name) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id`,
      [
        username.trim().toLowerCase(), 
        email.trim().toLowerCase(), 
        passwordHash, 
        verificationToken,
        character_name ? character_name.trim() : null,
        tribe_name ? tribe_name.trim() : 'Sem Tribo'
      ]
    );

    const userId = insertRes.rows[0].id;

    // Log de auditoria
    await db.query(
      'INSERT INTO audit_logs (user_id, action, ip_address, details) VALUES ($1, $2, $3, $4)',
      [userId, 'REGISTER', req.ip, `Usuário registrado com sucesso: ${username}`]
    );

    // Link de verificação
    const protocol = req.secure ? 'https' : 'http';
    const verifyLink = `${protocol}://${req.get('host')}/api/auth/verify?token=${verificationToken}`;

    // Enviar e-mail de boas-vindas e verificação
    const emailSubject = '🦕 Punisher ARK - Confirmação de Cadastro!';
    const emailBody = `
      <h2>Bem-vindo à nossa comunidade, Sobrevivente!</h2>
      <p>Obrigado por se registrar no servidor Punisher ARK Survival Ascended.</p>
      <p>Antes de poder resgatar itens e usufruir da loja virtual, por favor verifique seu endereço de e-mail clicando no link abaixo:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verifyLink}" style="background-color: #00ffc4; color: #0b0c10; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">VERIFICAR MEU E-MAIL</a>
      </div>
      <p>Caso o botão acima não funcione, copie e cole o link a seguir no seu navegador:</p>
      <p><code>${verifyLink}</code></p>
    `;
    await sendEmail(email.trim().toLowerCase(), emailSubject, emailBody).catch(e =>
      console.error('[AUTH REGISTER] Falha ao enviar e-mail de registro:', e.message)
    );

    res.status(201).json({ 
      message: 'Usuário registrado com sucesso! Por favor, verifique seu e-mail para ativar a conta.' 
    });

  } catch (err) {
    console.error('[AUTH REGISTER ERROR]', err.message);
    res.status(500).json({ error: 'Erro interno no servidor ao tentar registrar usuário.' });
  }
});

/**
 * 2. VERIFICAÇÃO DE E-MAIL (Redirecionamento)
 */
router.get('/verify', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send('Token de verificação inválido.');
  }

  try {
    const userRes = await db.query(
      'SELECT id, username FROM users WHERE verification_token = $1',
      [token]
    );

    if (userRes.rows.length === 0) {
      return res.status(400).send('Token de verificação inválido ou já utilizado.');
    }

    const user = userRes.rows[0];

    // Atualizar status de verificação e limpar token
    await db.query(
      'UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE id = $1',
      [user.id]
    );

    // Auditoria
    await db.query(
      'INSERT INTO audit_logs (user_id, action, ip_address, details) VALUES ($1, $2, $3, $4)',
      [user.id, 'EMAIL_VERIFIED', req.ip, `E-mail verificado com sucesso para ${user.username}`]
    );

    // Redireciona o usuário para o site com um alerta de sucesso
    res.redirect('/index.html?verified=true');

  } catch (err) {
    console.error('[AUTH VERIFY ERROR]', err.message);
    res.status(500).send('Erro interno ao tentar verificar o e-mail.');
  }
});

/**
 * 3. LOGIN DO USUÁRIO
 */
router.post('/login', authLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Preencha usuário/e-mail e senha.' });
  }

  try {
    // Buscar usuário por username ou email
    const userRes = await db.query(
      'SELECT * FROM users WHERE username = $1 OR email = $1',
      [username.trim().toLowerCase()]
    );

    if (userRes.rows.length === 0) {
      return res.status(400).json({ error: 'Usuário ou senha incorretos.' });
    }

    const user = userRes.rows[0];

    // Verificar se a conta está banida
    if (user.is_banned) {
      return res.status(403).json({ error: 'Esta conta foi suspensa do site e do servidor.' });
    }

    // Verificar se a senha confere
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Usuário ou senha incorretos.' });
    }

    // Gerar Token JWT (Expira em 24h)
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Verificar expiração do VIP
    let activeVipStatus = user.vip_status;
    let activeVipDiscount = user.vip_discount_percent;
    if (user.vip_status && user.vip_status !== 'Membro' && user.vip_expires_at && new Date() > new Date(user.vip_expires_at)) {
      console.log(`[AUTH LOGIN] VIP expirado para o usuário ${user.id}. Revertendo para Membro.`);
      await db.query(
        "UPDATE users SET vip_status = 'Membro', vip_discount_percent = 0, vip_expires_at = NULL WHERE id = $1",
        [user.id]
      );
      activeVipStatus = 'Membro';
      activeVipDiscount = 0;
    }

    // Auditoria
    await db.query(
      'INSERT INTO audit_logs (user_id, action, ip_address, details) VALUES ($1, $2, $3, $4)',
      [user.id, 'LOGIN', req.ip, 'Login efetuado com sucesso']
    );

    // Retornar token e dados públicos do usuário
    res.status(200).json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        ark_id: user.ark_id,
        is_verified: user.is_verified,
        coins_balance: user.coins_balance,
        vip_status: activeVipStatus,
        vip_discount_percent: activeVipDiscount,
        character_name: user.character_name,
        tribe_name: user.tribe_name
      }
    });

  } catch (err) {
    console.error('[AUTH LOGIN ERROR]', err.message);
    res.status(500).json({ error: 'Erro interno ao efetuar login.' });
  }
});

/**
 * 4. ATUALIZAR ID DO ARK
 */
router.put('/profile/ark-id', authenticateToken, async (req, res) => {
  const { ark_id } = req.body;
  const userId = req.user.id;

  if (ark_id === undefined) {
    return res.status(400).json({ error: 'ID ARK não fornecido.' });
  }

  const cleanArkId = ark_id ? ark_id.trim() : null;

  try {
    // Se o usuário está tentando vincular um ID ARK não nulo, verifica duplicidade
    if (cleanArkId) {
      const checkRes = await db.query(
        'SELECT id, username FROM users WHERE ark_id = $1 AND id <> $2',
        [cleanArkId, userId]
      );

      if (checkRes.rows.length > 0) {
        return res.status(400).json({ 
          error: `Este ID ARK já está vinculado a outro usuário (${checkRes.rows[0].username}).` 
        });
      }
    }

    // Atualiza no banco
    await db.query(
      'UPDATE users SET ark_id = $1 WHERE id = $2',
      [cleanArkId, userId]
    );

    // Auditoria
    await db.query(
      'INSERT INTO audit_logs (user_id, action, ip_address, details) VALUES ($1, $2, $3, $4)',
      [userId, 'UPDATE_ARK_ID', req.ip, `ID ARK atualizado para: ${cleanArkId || 'nenhum'}`]
    );

    res.status(200).json({ 
      message: 'ID ARK atualizado com sucesso!',
      ark_id: cleanArkId
    });

  } catch (err) {
    console.error('[AUTH UPDATE ARK ID ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao tentar atualizar o ID ARK.' });
  }
});

/**
 * 5. ATUALIZAR PERFIL DO JOGADOR
 */
router.put('/profile', authenticateToken, async (req, res) => {
  const { character_name, tribe_name } = req.body;
  const userId = req.user.id;

  try {
    await db.query(
      'UPDATE users SET character_name = $1, tribe_name = $2 WHERE id = $3',
      [
        character_name ? character_name.trim() : null, 
        tribe_name ? tribe_name.trim() : 'Sem Tribo', 
        userId
      ]
    );

    res.status(200).json({ message: 'Dados do perfil atualizados!' });
  } catch (err) {
    console.error('[AUTH UPDATE PROFILE ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao atualizar dados do perfil.' });
  }
});

/**
 * 5a. ALTERAR SENHA DO USUÁRIO LOGADO
 */
router.put('/profile/password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Preencha a senha atual e a nova senha.' });
  }

  try {
    // Buscar a senha hash atual do usuário
    const userRes = await db.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const user = userRes.rows[0];

    // Verificar se a senha atual está correta
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Senha atual incorreta.' });
    }

    // Gerar hash para a nova senha
    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);

    // Atualizar no banco de dados
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);

    // Registrar ação no log de auditoria
    await db.query(
      'INSERT INTO audit_logs (user_id, action, ip_address, details) VALUES ($1, $2, $3, $4)',
      [userId, 'CHANGE_PASSWORD', req.ip, 'Senha alterada pelo próprio usuário no painel de perfil']
    );

    res.status(200).json({ message: 'Senha atualizada com sucesso!' });
  } catch (err) {
    console.error('[AUTH CHANGE PASSWORD ERROR]', err.message);
    res.status(500).json({ error: 'Erro interno ao alterar a senha.' });
  }
});


/**
 * 6. RECUPERAÇÃO DE SENHA (FORGOT PASSWORD)
 */
router.post('/forgot-password', authLimiter, async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Informe o e-mail de cadastro.' });
  }

  try {
    const userRes = await db.query(
      'SELECT id, username, email FROM users WHERE email = $1',
      [email.trim().toLowerCase()]
    );

    // Para evitar spoofing/vazamento de e-mails, retornamos sucesso mesmo se o e-mail não existir
    if (userRes.rows.length === 0) {
      return res.status(200).json({ 
        message: 'Se o e-mail existir no nosso sistema, as instruções de recuperação de senha serão enviadas.' 
      });
    }

    const user = userRes.rows[0];

    // Gerar token de redefinição
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenExpires = new Date(Date.now() + 3600000); // 1 hora de expiração

    await db.query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
      [resetToken, tokenExpires, user.id]
    );

    const protocol = req.secure ? 'https' : 'http';
    const resetLink = `${protocol}://${req.get('host')}/index.html?reset_token=${resetToken}`;

    // Enviar e-mail de recuperação
    const emailSubject = '🔑 Punisher ARK - Solicitação de Recuperação de Senha';
    const emailBody = `
      <h2>Recuperação de Senha</h2>
      <p>Você solicitou a redefinição de senha da sua conta Punisher ARK para o usuário: <strong>${user.username}</strong>.</p>
      <p>Para criar uma nova senha, clique no link abaixo. Este link expira em 1 hora:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}" style="background-color: #ff9f43; color: #0b0c10; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">REDEFINIR SENHA</a>
      </div>
      <p>Se você não solicitou essa redefinição, apenas desconsidere este e-mail.</p>
    `;

    await sendEmail(user.email, emailSubject, emailBody);

    res.status(200).json({ 
      message: 'Instruções de redefinição enviadas para o seu e-mail!' 
    });

  } catch (err) {
    console.error('[AUTH FORGOT PASS ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao processar solicitação de recuperação de senha.' });
  }
});

/**
 * 7. REDEFINIR SENHA (RESET PASSWORD)
 */
router.post('/reset-password', authLimiter, async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ error: 'Token e nova senha são obrigatórios.' });
  }

  try {
    const userRes = await db.query(
      'SELECT id, username, email FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    );

    if (userRes.rows.length === 0) {
      return res.status(400).json({ error: 'Token de redefinição inválido ou expirado.' });
    }

    const user = userRes.rows[0];

    // Criptografar nova senha
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(password, salt);

    // Atualizar senha no banco e limpar tokens
    await db.query(
      `UPDATE users 
       SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL 
       WHERE id = $2`,
      [newPasswordHash, user.id]
    );

    // Auditoria
    await db.query(
      'INSERT INTO audit_logs (user_id, action, ip_address, details) VALUES ($1, $2, $3, $4)',
      [user.id, 'RESET_PASSWORD', req.ip, 'Senha redefinida com sucesso via link de e-mail']
    );

    // E-mail de notificação de segurança
    const emailSubject = '🔒 Punisher ARK - Sua senha foi alterada';
    const emailBody = `
      <h2>Olá, ${user.username}!</h2>
      <p>Gostaríamos de informar que a senha da sua conta Punisher ARK foi alterada com sucesso.</p>
      <p>Se você realizou essa alteração, nenhuma ação é necessária.</p>
      <p style="color: #ea8685;"><strong>Atenção:</strong> Se você NÃO realizou essa alteração, por favor acesse nosso suporte imediatamente.</p>
    `;
    await sendEmail(user.email, emailSubject, emailBody).catch(e =>
      console.error('[AUTH RESET PASSWORD] Falha no e-mail de alerta de alteração:', e.message)
    );

    res.status(200).json({ message: 'Sua senha foi redefinida com sucesso! Agora você pode fazer login.' });

  } catch (err) {
    console.error('[AUTH RESET PASS ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao redefinir senha.' });
  }
});

/**
 * 8. OBTER CONTA DO USUÁRIO LOGADO
 */
router.get('/me', authenticateToken, async (req, res) => {
  // Retorna os dados atualizados do usuário do banco
  try {
    // Verificar expiração do VIP
    const checkVip = await db.query(
      'SELECT vip_status, vip_expires_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (checkVip.rows.length > 0) {
      const u = checkVip.rows[0];
      if (u.vip_status && u.vip_status !== 'Membro' && u.vip_expires_at && new Date() > new Date(u.vip_expires_at)) {
        console.log(`[AUTH ME] VIP expirado para o usuário ${req.user.id}. Revertendo para Membro.`);
        await db.query(
          "UPDATE users SET vip_status = 'Membro', vip_discount_percent = 0, vip_expires_at = NULL WHERE id = $1",
          [req.user.id]
        );
      }
    }

    const userRes = await db.query(
      `SELECT id, username, email, role, ark_id, is_verified, 
              character_name, character_level, kills, deaths, 
              playtime_hours, coins_balance, vip_status, vip_expires_at, vip_discount_percent, tribe_name, tribe_role, created_at 
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    res.status(200).json({ user: userRes.rows[0] });
  } catch (err) {
    console.error('[AUTH GET ME ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao buscar dados do perfil.' });
  }
});

module.exports = router;
