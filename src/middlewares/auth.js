const jwt = require('jsonwebtoken');
const db = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'ark_jwt_secret_token_key_12345';

/**
 * Middleware para validar o token JWT e autenticar o usuário.
 */
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  // O token pode vir no header "Authorization: Bearer <TOKEN>" ou como query param para fins especiais
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Buscar usuário para verificar se está banido ou se ainda existe
    const userRes = await db.query(
      'SELECT id, username, email, role, is_banned, ark_id, coins_balance FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const user = userRes.rows[0];

    if (user.is_banned) {
      return res.status(403).json({ error: 'Esta conta foi banida do servidor.' });
    }

    req.user = user; // Anexa as informações básicas do usuário logado à requisição
    next();
  } catch (err) {
    console.error('[AUTH MIDDLEWARE] Token inválido:', err.message);
    return res.status(403).json({ error: 'Sessão expirada ou token inválido. Faça login novamente.' });
  }
}

/**
 * Middleware para garantir privilégios administrativos.
 * Deve ser colocado APÓS o authenticateToken.
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado. Requer privilégios de Administrador.' });
  }
  next();
}

module.exports = {
  authenticateToken,
  requireAdmin
};
