const rateLimit = require('express-rate-limit');

/**
 * Limitador para rotas críticas de autenticação (brute force mitigation).
 * Permite no máximo 15 requisições de login/cadastro a cada 10 minutos por IP.
 */
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutos
  max: 25,
  message: { 
    error: 'Muitas tentativas a partir deste IP. Por favor, tente novamente após 10 minutos.' 
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Limitador para receber webhooks do Mercado Pago para proteção contra flood de requisições.
 */
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 60,
  message: { 
    error: 'Limite de requisições de webhook atingido.' 
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  authLimiter,
  webhookLimiter
};
