require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { initDatabase } = require('./src/config/db');
const { startDeliveryWorker } = require('./src/services/delivery');

// Importar Rotas
const authRoutes = require('./src/routes/auth');
const productRoutes = require('./src/routes/products');
const orderRoutes = require('./src/routes/orders');
const rankingRoutes = require('./src/routes/ranking');
const adminRoutes = require('./src/routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware padrão
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos da pasta frontend
app.use(express.static(path.join(__dirname, 'public')));

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/admin', adminRoutes);

// Fallback para SPA routing (qualquer rota não API serve index.html)
app.get('*', (req, res) => {
  // Ignora chamadas de API que deram 404
  if (req.originalUrl.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint da API não encontrado.' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Inicialização do Servidor
async function startServer() {
  try {
    // 1. Inicializar Banco de Dados (conectar e criar tabelas se necessário)
    await initDatabase();
    
    // 2. Iniciar Worker RCON para entregar produtos comprados automaticamente
    startDeliveryWorker();

    // 3. Iniciar escuta HTTP
    app.listen(PORT, () => {
      console.log(`================================================================`);
      console.log(`🎮 PUNISHER ARK SERVER WEBSITE RODANDO COM SUCESSO!`);
      console.log(`🚀 Porta local: http://localhost:${PORT}`);
      console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'production'}`);
      console.log(`================================================================`);
    });
  } catch (error) {
    console.error('Falha crítica ao iniciar o servidor:', error.message);
    process.exit(1);
  }
}

startServer();
