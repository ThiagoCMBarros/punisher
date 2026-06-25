const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'ark_server_db',
  user: process.env.DB_USER || 'ark_admin',
  password: process.env.DB_PASSWORD || 'ark_secure_pass_998',
});

// Testar conexão e inicializar banco se as tabelas não existirem
async function initDatabase() {
  let attempts = 10;
  while (attempts > 0) {
    try {
      console.log('Tentando conectar ao banco de dados PostgreSQL...');
      const client = await pool.connect();
      console.log('Conectado ao PostgreSQL com sucesso!');
      
      // Verificar se a tabela users existe
      const res = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'users'
        );
      `);
      
      const exists = res.rows[0].exists;
      if (!exists) {
        console.log('Estrutura do banco de dados não encontrada. Inicializando via schema.sql...');
        const sqlPath = path.join(__dirname, '..', 'database', 'schema.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        await client.query(sql);
        console.log('Tabelas e dados iniciais criados com sucesso!');
      } else {
        console.log('Banco de dados já configurado (tabelas existentes).');
      }
      
      client.release();
      break;
    } catch (err) {
      console.error('Falha de conexão com o banco de dados:', err.message);
      attempts--;
      if (attempts === 0) {
        console.error('Não foi possível conectar ao banco após várias tentativas. Encerrando processo.');
        process.exit(1);
      }
      console.log('Aguardando 3 segundos para tentar novamente...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  initDatabase
};
