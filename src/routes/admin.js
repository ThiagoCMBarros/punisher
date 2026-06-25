const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middlewares/auth');
const { triggerManualDelivery } = require('../services/delivery');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Garantir que a pasta de uploads de imagem exista
const uploadDir = path.join(__dirname, '../../public/img/products');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, 'product-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // limitar em 5MB
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|webp|gif/;
    const mimeType = allowedTypes.test(file.mimetype);
    const extName = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    if (mimeType && extName) {
      return cb(null, true);
    }
    cb(new Error('Apenas imagens (jpeg, jpg, png, webp, gif) são permitidas!'));
  }
});

// Proteger todas as rotas neste arquivo para requerer login e privilégio ADMIN
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * 1. GERENCIAR USUÁRIOS: LISTAR TODOS
 */
router.get('/users', async (req, res) => {
  try {
    const usersRes = await db.query(
      `SELECT id, username, email, role, is_banned, ark_id, character_name, 
              character_level, kills, deaths, playtime_hours, coins_balance, 
              vip_status, tribe_name, created_at 
       FROM users 
       ORDER BY created_at DESC`
    );
    res.status(200).json({ users: usersRes.rows });
  } catch (err) {
    console.error('[ADMIN GET USERS ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao listar usuários.' });
  }
});

/**
 * 2. GERENCIAR USUÁRIOS: BANIR / DESBANIR
 */
router.put('/users/:id/ban', async (req, res) => {
  const { id } = req.params;
  const { is_banned } = req.body;

  if (id === req.user.id) {
    return res.status(400).json({ error: 'Você não pode banir a si mesmo.' });
  }

  try {
    const userCheck = await db.query('SELECT username FROM users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    await db.query('UPDATE users SET is_banned = $1 WHERE id = $2', [is_banned, id]);

    await db.query(
      'INSERT INTO audit_logs (user_id, action, ip_address, details) VALUES ($1, $2, $3, $4)',
      [req.user.id, is_banned ? 'BAN_USER' : 'UNBAN_USER', req.ip, `Usuário banido/desbanido (ID: ${id}) - Status: ${is_banned}`]
    );

    res.status(200).json({ message: `Status de banimento do usuário alterado para: ${is_banned}` });
  } catch (err) {
    console.error('[ADMIN BAN USER ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao alterar banimento de usuário.' });
  }
});

/**
 * 3. GERENCIAR USUÁRIOS: ALTERAR PERMISSÃO (Role)
 */
router.put('/users/:id/role', async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (id === req.user.id) {
    return res.status(400).json({ error: 'Você não pode alterar sua própria permissão.' });
  }

  try {
    await db.query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);

    await db.query(
      'INSERT INTO audit_logs (user_id, action, ip_address, details) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'CHANGE_ROLE', req.ip, `Role do usuário (ID: ${id}) alterada para: ${role}`]
    );

    res.status(200).json({ message: 'Cargo de usuário atualizado.' });
  } catch (err) {
    console.error('[ADMIN ROLE ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao alterar cargo do usuário.' });
  }
});

/**
 * 4. GERENCIAR PRODUTOS: LISTAR TODAS AS VARIAÇÕES (INCLUINDO INATIVAS)
 */
router.get('/products', async (req, res) => {
  try {
    const prodRes = await db.query(
      `SELECT pv.id, pv.nome as name, pv.tipo as type, pv.level, pv.descricao as description, 
              pv.valor as price, pv.purchase_limit, pv.permite_desconto as allow_discount, pv.ativo as is_active, pv.comando_rcon,
              p.nome as parent_name, p.categoria as category, p.id as product_id, p.imagem_url
       FROM produto_variacoes pv
       JOIN produtos p ON pv.produto_id = p.id
       ORDER BY p.categoria, p.nome, pv.valor ASC`
    );
    res.status(200).json({ products: prodRes.rows });
  } catch (err) {
    console.error('[ADMIN GET PRODUCTS ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao listar produtos e variações.' });
  }
});

/**
 * 4b. GERENCIAR PRODUTOS: LISTAR TODOS OS PRODUTOS PAI (AGRUPADORES)
 */
router.get('/products/parents', async (req, res) => {
  try {
    const parentsRes = await db.query('SELECT id, nome as name, categoria as category, imagem_url FROM produtos ORDER BY nome ASC');
    res.status(200).json({ parents: parentsRes.rows });
  } catch (err) {
    console.error('[ADMIN GET PARENTS ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao listar produtos pais.' });
  }
});

/**
 * 4c. GERENCIAR PRODUTOS: UPLOAD DE IMAGEM DO PRODUTO
 */
router.post('/products/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }
    // Retorna o caminho relativo acessível publicamente
    const imageUrl = `/img/products/${req.file.filename}`;
    res.status(200).json({ imageUrl });
  } catch (err) {
    console.error('[ADMIN UPLOAD IMAGE ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao fazer upload da imagem.' });
  }
});

/**
 * 5. GERENCIAR PRODUTOS: CRIAR VARIAÇÃO (Cria produto pai se necessário)
 */
router.post('/products', async (req, res) => {
  const { name, description, price, category, is_active, purchase_limit, rcon_command, level, type, parent_name, allow_discount, image_url } = req.body;

  if (!name || !price || !category || !parent_name || rcon_command === undefined) {
    return res.status(400).json({ 
      error: 'Preencha os campos obrigatórios (Nome, Preço, Categoria, Produto Pai e Comando RCON).' 
    });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Resolver/Criar o produto pai pelo Slug
    const slug = parent_name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
    
    let parentRes = await client.query('SELECT id FROM produtos WHERE slug = $1', [slug]);
    let parentId;

    if (parentRes.rows.length === 0) {
      // Criar novo produto pai
      const insertParent = await client.query(
        'INSERT INTO produtos (nome, slug, categoria, descricao, imagem_url) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [parent_name.trim(), slug, category.trim(), `Produto pai para variações de ${parent_name}`, image_url || null]
      );
      parentId = insertParent.rows[0].id;
    } else {
      parentId = parentRes.rows[0].id;
      // Atualizar a imagem do produto pai se enviada
      if (image_url) {
        await client.query('UPDATE produtos SET imagem_url = $1 WHERE id = $2', [image_url, parentId]);
      }
    }

    // 2. Inserir a variação de produto
    const insertVar = await client.query(
      `INSERT INTO produto_variacoes 
        (produto_id, nome, tipo, level, descricao, valor, comando_rcon, ativo, purchase_limit, permite_desconto)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        parentId,
        name.trim(),
        type ? type.trim() : 'Padrão',
        level ? parseInt(level, 10) : null,
        description ? description.trim() : '',
        parseFloat(price),
        rcon_command.trim(),
        is_active !== undefined ? is_active : true,
        parseInt(purchase_limit, 10) || 0,
        allow_discount !== undefined ? allow_discount : true
      ]
    );

    await client.query('COMMIT');
    client.release();

    // Audit Log
    await db.query(
      'INSERT INTO audit_logs (user_id, action, ip_address, details) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'CREATE_PRODUCT_VAR', req.ip, `Criou variação: ${name} (Pai: ${parent_name}) por R$ ${price}`]
    );

    res.status(201).json({ message: 'Variação de produto cadastrada!', product: insertVar.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    console.error('[ADMIN CREATE PRODUCT VAR ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao cadastrar variação de produto.' });
  }
});

/**
 * 6. GERENCIAR PRODUTOS: ATUALIZAR VARIAÇÃO
 */
router.put('/products/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, price, category, is_active, purchase_limit, rcon_command, level, type, parent_name, allow_discount, image_url } = req.body;

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Verificar se a variação existe
    const varCheck = await client.query('SELECT * FROM produto_variacoes WHERE id = $1', [id]);
    if (varCheck.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'Variação de produto não encontrada.' });
    }

    // 2. Resolver produto pai se enviado
    let parentId = varCheck.rows[0].produto_id;
    if (parent_name) {
      const slug = parent_name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
      let parentRes = await client.query('SELECT id FROM produtos WHERE slug = $1', [slug]);
      
      if (parentRes.rows.length === 0) {
        // Criar novo produto pai
        const insertParent = await client.query(
          'INSERT INTO produtos (nome, slug, categoria, descricao, imagem_url) VALUES ($1, $2, $3, $4, $5) RETURNING id',
          [parent_name.trim(), slug, category || 'Geral', `Produto pai para variações de ${parent_name}`, image_url || null]
        );
        parentId = insertParent.rows[0].id;
      } else {
        parentId = parentRes.rows[0].id;
        // Atualizar categoria e imagem do pai
        let updateQuery = 'UPDATE produtos SET categoria = $1';
        const updateParams = [category.trim()];
        if (image_url !== undefined && image_url !== null) {
          updateQuery += ', imagem_url = $2';
          updateParams.push(image_url);
        }
        updateQuery += ' WHERE id = $' + (updateParams.length + 1);
        updateParams.push(parentId);
        await client.query(updateQuery, updateParams);
      }
    }

    // 3. Atualizar a variação
    await client.query(
      `UPDATE produto_variacoes 
       SET nome = $1, tipo = $2, level = $3, descricao = $4, 
           valor = $5, comando_rcon = $6, ativo = $7, purchase_limit = $8, permite_desconto = $9, produto_id = $10
       WHERE id = $11`,
      [
        name,
        type || 'Padrão',
        level ? parseInt(level, 10) : null,
        description || '',
        parseFloat(price),
        rcon_command,
        is_active,
        parseInt(purchase_limit, 10) || 0,
        allow_discount !== undefined ? allow_discount : true,
        parentId,
        id
      ]
    );

    await client.query('COMMIT');
    client.release();

    await db.query(
      'INSERT INTO audit_logs (user_id, action, ip_address, details) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'UPDATE_PRODUCT_VAR', req.ip, `Atualizou variação ID ${id} (${name})`]
    );

    res.status(200).json({ message: 'Variação de produto atualizada com sucesso!' });
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    console.error('[ADMIN UPDATE PRODUCT VAR ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao atualizar variação de produto.' });
  }
});

/**
 * 7. GERENCIAR PRODUTOS: EXCLUIR VARIAÇÃO (DELETAR DO BANCO)
 */
router.delete('/products/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Realmente deletar do banco
    await db.query('DELETE FROM produto_variacoes WHERE id = $1', [id]);

    await db.query(
      'INSERT INTO audit_logs (user_id, action, ip_address, details) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'DELETE_PRODUCT_VAR', req.ip, `Excluiu permanentemente a variação ID: ${id}`]
    );

    res.status(200).json({ message: 'Variação excluída permanentemente com sucesso do banco de dados.' });
  } catch (err) {
    console.error('[ADMIN DELETE PRODUCT VAR ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao excluir variação permanentemente.' });
  }
});

/**
 * 7b. GERENCIAR PRODUTOS: INATIVAR / ATIVAR VARIAÇÃO (MUDAR STATUS)
 */
router.put('/products/:id/toggle-active', async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;

  try {
    await db.query('UPDATE produto_variacoes SET ativo = $1 WHERE id = $2', [is_active, id]);

    await db.query(
      'INSERT INTO audit_logs (user_id, action, ip_address, details) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'TOGGLE_PRODUCT_ACTIVE', req.ip, `${is_active ? 'Ativou' : 'Inativou'} variação ID: ${id}`]
    );

    res.status(200).json({ message: `Variação ${is_active ? 'ativada' : 'inativada'} com sucesso.` });
  } catch (err) {
    console.error('[ADMIN TOGGLE ACTIVE PRODUCT VAR ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao alterar status da variação.' });
  }
});

/**
 * 8. VISUALIZAR TODOS OS PEDIDOS DO SITE
 */
router.get('/orders', async (req, res) => {
  try {
    const ordersRes = await db.query(
      `SELECT o.id, o.is_gift, o.recipient_ark_id, o.payment_status, o.payment_id, 
              o.total_amount, o.created_at, u.username as purchaser_name, u.email as purchaser_email
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       ORDER BY o.created_at DESC`
    );
    res.status(200).json({ orders: ordersRes.rows });
  } catch (err) {
    console.error('[ADMIN GET ORDERS ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao listar pedidos.' });
  }
});

/**
 * 9. VISUALIZAR FILA DE ENTREGAS RCON
 */
router.get('/deliveries', async (req, res) => {
  try {
    const queueRes = await db.query(
      `SELECT dq.*, pv.nome as product_name, o.id as order_id, u.username as purchaser_name
       FROM delivery_queue dq
       JOIN order_items oi ON dq.order_item_id = oi.id
       JOIN orders o ON oi.order_id = o.id
       LEFT JOIN users u ON o.user_id = u.id
       JOIN produto_variacoes pv ON oi.variation_id = pv.id
       ORDER BY dq.created_at DESC`
    );
    res.status(200).json({ deliveries: queueRes.rows });
  } catch (err) {
    console.error('[ADMIN GET DELIVERIES ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao obter fila de entregas.' });
  }
});

/**
 * 10. REENVIAR ENTREGA FALHA MANUALMENTE
 */
router.post('/deliveries/:id/retry', async (req, res) => {
  const { id } = req.params;

  try {
    const checkDel = await db.query('SELECT status FROM delivery_queue WHERE id = $1', [id]);
    if (checkDel.rows.length === 0) {
      return res.status(404).json({ error: 'Entrega não encontrada na fila.' });
    }

    await db.query(
      "UPDATE delivery_queue SET status = 'pending', attempts = 0, error_log = 'Reenvio manual disparado pelo Admin' WHERE id = $1",
      [id]
    );

    await db.query(
      'INSERT INTO audit_logs (user_id, action, ip_address, details) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'RETRY_DELIVERY', req.ip, `Reenvio manual acionado para entrega ID ${id}`]
    );

    triggerManualDelivery();

    res.status(200).json({ message: 'Entrega reiniciada! A fila RCON foi acionada para reprocessamento.' });
  } catch (err) {
    console.error('[ADMIN RETRY DELIVERY ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao reenviar entrega.' });
  }
});

/**
 * 11. CANCELAR ENTREGA DA FILA
 */
router.post('/deliveries/:id/cancel', async (req, res) => {
  const { id } = req.params;

  try {
    const checkDel = await db.query('SELECT status FROM delivery_queue WHERE id = $1', [id]);
    if (checkDel.rows.length === 0) {
      return res.status(404).json({ error: 'Entrega não encontrada.' });
    }

    await db.query(
      "UPDATE delivery_queue SET status = 'cancelled', error_log = 'Cancelado manualmente pelo Admin' WHERE id = $1",
      [id]
    );

    await db.query(
      'INSERT INTO audit_logs (user_id, action, ip_address, details) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'CANCEL_DELIVERY', req.ip, `Cancelou entrega ID ${id}`]
    );

    res.status(200).json({ message: 'Entrega cancelada na fila de RCON.' });
  } catch (err) {
    console.error('[ADMIN CANCEL DELIVERY ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao cancelar entrega.' });
  }
});

/**
 * 12. VER LOGS DE AUDITORIA
 */
router.get('/logs', async (req, res) => {
  try {
    const logsRes = await db.query(
      `SELECT al.*, u.username 
       FROM audit_logs al 
       LEFT JOIN users u ON al.user_id = u.id 
       ORDER BY al.created_at DESC 
       LIMIT 100`
    );
    res.status(200).json({ logs: logsRes.rows });
  } catch (err) {
    console.error('[ADMIN GET AUDIT LOGS ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao recuperar logs de auditoria.' });
  }
});

/**
 * 12a. ROTA PARA TESTAR CONEXÃO RCON (Executa ListPlayers e retorna resposta)
 * GET /api/admin/ark/rcon/test
 */
router.get('/ark/rcon/test', async (req, res) => {
  try {
    const { sendRconCommand } = require('../services/rcon');
    const response = await sendRconCommand('ListPlayers');
    res.status(200).json({ success: true, response });
  } catch (err) {
    console.error('[ADMIN RCON TEST ERROR]', err.message);
    res.status(500).json({ error: 'Falha ao conectar ou executar comando RCON.', details: err.message });
  }
});

/**
 * 12b. ROTA PARA ENVIAR BROADCAST
 * POST /api/admin/ark/rcon/broadcast
 */
router.post('/ark/rcon/broadcast', async (req, res) => {
  const { message } = req.body;
  if (!message || message.trim() === '') {
    return res.status(400).json({ error: 'Mensagem de broadcast não informada.' });
  }

  try {
    const { sendRconCommand } = require('../services/rcon');
    const response = await sendRconCommand(`ServerChat ${message.trim()}`);
    
    // Registrar ação no log de auditoria
    await db.query(
      'INSERT INTO audit_logs (user_id, action, ip_address, details) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'RCON_BROADCAST', req.ip, `Mensagem de broadcast enviada: ${message}`]
    );

    res.status(200).json({ success: true, response });
  } catch (err) {
    console.error('[ADMIN RCON BROADCAST ERROR]', err.message);
    res.status(500).json({ error: 'Falha ao enviar broadcast via RCON.', details: err.message });
  }
});

/**
 * 12c. ROTA PARA ENVIAR COMANDO CUSTOMIZADO RCON
 * POST /api/admin/ark/rcon/command
 */
router.post('/ark/rcon/command', async (req, res) => {
  const { command } = req.body;
  if (!command || command.trim() === '') {
    return res.status(400).json({ error: 'Comando RCON não informado.' });
  }

  try {
    const { sendRconCommand } = require('../services/rcon');
    const response = await sendRconCommand(command.trim());
    
    // Registrar ação no log de auditoria
    await db.query(
      'INSERT INTO audit_logs (user_id, action, ip_address, details) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'RCON_COMMAND', req.ip, `Comando RCON customizado executado: ${command}`]
    );

    res.status(200).json({ success: true, response });
  } catch (err) {
    console.error('[ADMIN RCON COMMAND ERROR]', err.message);
    res.status(500).json({ error: 'Falha ao executar comando RCON.', details: err.message });
  }
});


/**
 * 13. VISUALIZAR CONFIGURAÇÕES GLOBAIS DO SERVIDOR
 */
router.get('/config', async (req, res) => {
  try {
    const configRes = await db.query('SELECT key, value FROM server_config');
    const configs = {};
    configRes.rows.forEach(row => {
      if (row.key.includes('password') || row.key.includes('access_token') || row.key.includes('pass')) {
        configs[row.key] = '••••••••••••••••';
      } else {
        configs[row.key] = row.value;
      }
    });

    res.status(200).json({ configs });
  } catch (err) {
    console.error('[ADMIN GET CONFIGS ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao obter configurações.' });
  }
});

/**
 * 14. SALVAR CONFIGURAÇÕES GLOBAIS DO SERVIDOR
 */
router.post('/config', async (req, res) => {
  const newConfigs = req.body;

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    for (const [key, rawValue] of Object.entries(newConfigs)) {
      if (rawValue === '••••••••••••••••') {
        continue;
      }

      await client.query(
        `INSERT INTO server_config (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key) 
         DO UPDATE SET value = EXCLUDED.value`,
        [key, String(rawValue).trim()]
      );
    }

    await client.query('COMMIT');
    client.release();

    await db.query(
      'INSERT INTO audit_logs (user_id, action, ip_address, details) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'UPDATE_CONFIG', req.ip, 'Configurações globais do sistema atualizadas']
    );

    res.status(200).json({ message: 'Configurações updated com sucesso!' });
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    console.error('[ADMIN UPDATE CONFIGS ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao salvar configurações do sistema.' });
  }
});

/**
 * 15. ALTERAR ID DO JOGADOR DESTINATÁRIO NO PEDIDO E REDIRECIONAR FILA RCON
 * PUT /api/admin/orders/:id/recipient
 */
router.put('/orders/:id/recipient', async (req, res) => {
  const { id } = req.params;
  const { recipient_ark_id } = req.body;

  if (!recipient_ark_id || recipient_ark_id.trim() === '') {
    return res.status(400).json({ error: 'O novo ID ARK não pode ser vazio.' });
  }

  const newArkId = recipient_ark_id.trim();
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Obter o pedido e o ID atual do destinatário
    const orderRes = await client.query('SELECT recipient_ark_id FROM orders WHERE id = $1', [id]);
    if (orderRes.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    const oldArkId = orderRes.rows[0].recipient_ark_id;

    // 2. Atualizar o ID do destinatário no pedido
    await client.query(
      'UPDATE orders SET recipient_ark_id = $1, updated_at = NOW() WHERE id = $2',
      [newArkId, id]
    );

    // 3. Buscar os itens da fila de entrega RCON vinculados a esse pedido
    const queueRes = await client.query(
      `SELECT dq.id, dq.rcon_command 
       FROM delivery_queue dq
       JOIN order_items oi ON dq.order_item_id = oi.id
       WHERE oi.order_id = $1`,
      [id]
    );

    // 4. Atualizar cada item da fila de entrega substituindo o ID antigo pelo novo no comando RCON
    for (const item of queueRes.rows) {
      // Substituir ocorrências do ID antigo pelo novo no comando RCON
      const updatedCommand = item.rcon_command.replace(new RegExp(oldArkId, 'g'), newArkId);

      await client.query(
        `UPDATE delivery_queue 
         SET recipient_ark_id = $1, rcon_command = $2, status = 'pending', attempts = 0, error_log = 'ID retificado pelo administrador'
         WHERE id = $3`,
        [newArkId, updatedCommand, item.id]
      );
    }

    await client.query('COMMIT');
    client.release();

    // Log de auditoria
    await db.query(
      'INSERT INTO audit_logs (user_id, action, ip_address, details) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'UPDATE_ORDER_RECIPIENT', req.ip, `Alterou ID ARK do pedido ${id} de '${oldArkId}' para '${newArkId}' e reiniciou entregas.`]
    );

    // Acionar a fila de entrega RCON em segundo plano
    const { triggerManualDelivery } = require('../services/delivery');
    triggerManualDelivery();

    res.status(200).json({ 
      message: 'ID do destinatário atualizado e entregas reiniciadas na fila RCON!',
      recipient_ark_id: newArkId
    });

  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    console.error('[ADMIN UPDATE ORDER RECIPIENT ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao atualizar ID do destinatário do pedido.' });
  }
});

/**
 * 16. APROVAR PEDIDO MANUALMENTE (Pix direto, etc)
 * POST /api/admin/orders/:id/approve
 */
router.post('/orders/:id/approve', async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Obter o pedido
    const orderRes = await db.query(
      `SELECT o.*, u.email as user_email, u.username as user_name 
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       WHERE o.id = $1`,
      [id]
    );

    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    const order = orderRes.rows[0];
    if (order.payment_status === 'approved') {
      return res.status(400).json({ error: 'Este pedido já está aprovado.' });
    }

    // 2. Obter a função de aprovação de orders.js
    const orderRoutes = require('./orders');
    const handleApprovedOrder = orderRoutes.handleApprovedOrder;

    if (!handleApprovedOrder) {
      throw new Error('Função de aprovação do pedido não localizada no módulo.');
    }

    // 3. Processar aprovação
    const paymentId = `manual_admin_${req.user.username}_${Date.now()}`;
    await handleApprovedOrder(order, paymentId);

    // 4. Log de auditoria
    await db.query(
      'INSERT INTO audit_logs (user_id, action, ip_address, details) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'MANUAL_APPROVE_ORDER', req.ip, `Aprovou manualmente o pedido ${id}. ID Pagamento gerado: ${paymentId}`]
    );

    res.status(200).json({ message: 'Pedido aprovado manualmente! Entregas RCON enfileiradas e e-mail enviado.' });

  } catch (err) {
    console.error('[ADMIN APPROVE ORDER ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao aprovar pedido: ' + err.message });
  }
});

/**
 * 17. OBTER STATUS E MODO ATUAL DO SERVIDOR (Via Nitrado API ou RCON)
 * GET /api/admin/ark/server/status
 */
router.get('/ark/server/status', async (req, res) => {
  try {
    const configs = await db.query(
      "SELECT key, value FROM server_config WHERE key IN ('nitrado_ip', 'nitrado_api_token', 'nitrado_service_id')"
    );
    const configMap = {};
    configs.rows.forEach(row => {
      configMap[row.key] = row.value;
    });

    const ip = configMap['nitrado_ip'] || '127.0.0.1';
    const apiToken = configMap['nitrado_api_token'] || '';
    const serviceId = configMap['nitrado_service_id'] || '';

    // Se estiver em ambiente simulado/local
    if (ip === '127.0.0.1' || ip === 'localhost') {
      const modeRes = await db.query("SELECT value FROM server_config WHERE key = 'mock_server_mode'");
      const currentMode = modeRes.rows[0] ? modeRes.rows[0].value : 'pvp';
      return res.status(200).json({
        success: true,
        status: 'online',
        mode: currentMode,
        is_mock: true
      });
    }

    // Se tiver credenciais reais da Nitrado
    if (apiToken && serviceId && !apiToken.includes('mock-token')) {
      try {
        const response = await fetch(`https://api.nitrado.net/services/${serviceId}/gameservers`, {
          headers: { 'Authorization': `Bearer ${apiToken}` }
        });
        const resData = await response.json();
        
        if (response.ok && resData.status === 'success') {
          const serverInfo = resData.data.gameserver;
          const apiStatus = serverInfo.status === 'started' ? 'online' : (serverInfo.status === 'restarting' ? 'restarting' : 'offline');
          
          let mode = 'pvp';
          if (serverInfo.settings && serverInfo.settings.general) {
            const pveEnabled = serverInfo.settings.general['server-pve'] || serverInfo.settings.general['disable-pvp'];
            if (String(pveEnabled) === 'true' || pveEnabled === true) {
              mode = 'pve';
            }
          }
          
          return res.status(200).json({
            success: true,
            status: apiStatus,
            mode: mode,
            is_mock: false
          });
        }
      } catch (apiErr) {
        console.error('[STATUS NITRADO API ERROR]', apiErr.message);
      }
    }

    // Fallback: tentar ping RCON local
    const { sendRconCommand } = require('../services/rcon');
    try {
      await sendRconCommand('ListPlayers');
      return res.status(200).json({
        success: true,
        status: 'online',
        mode: 'Desconhecido (Requer API Nitrado)',
        is_mock: false
      });
    } catch (_) {
      return res.status(200).json({
        success: true,
        status: 'offline',
        mode: 'Desconhecido (Requer API Nitrado)',
        is_mock: false
      });
    }

  } catch (err) {
    console.error('[ADMIN GET STATUS ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao buscar status do servidor.' });
  }
});

/**
 * 18. REINICIAR SERVIDOR (Nitrado API com Fallback RCON DoExit)
 * POST /api/admin/ark/server/restart
 */
router.post('/ark/server/restart', async (req, res) => {
  try {
    const configs = await db.query(
      "SELECT key, value FROM server_config WHERE key IN ('nitrado_ip', 'nitrado_api_token', 'nitrado_service_id')"
    );
    const configMap = {};
    configs.rows.forEach(row => {
      configMap[row.key] = row.value;
    });

    const ip = configMap['nitrado_ip'] || '127.0.0.1';
    const apiToken = configMap['nitrado_api_token'] || '';
    const serviceId = configMap['nitrado_service_id'] || '';

    // Mock local
    if (ip === '127.0.0.1' || ip === 'localhost') {
      return res.status(200).json({
        success: true,
        message: '[SIMULAÇÃO] Servidor reiniciado com sucesso!'
      });
    }

    let apiRestarted = false;
    let apiError = '';

    // 1. Tentar Nitrado API
    if (apiToken && serviceId && !apiToken.includes('mock-token')) {
      try {
        const response = await fetch(`https://api.nitrado.net/services/${serviceId}/gameservers/restart`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiToken}` }
        });
        const resData = await response.json();
        if (response.ok && resData.status === 'success') {
          apiRestarted = true;
        } else {
          apiError = resData.message || 'Erro desconhecido';
        }
      } catch (e) {
        apiError = e.message;
      }
    }

    // 2. RCON Fallback
    let rconSuccess = false;
    try {
      const { sendRconCommand } = require('../services/rcon');
      await sendRconCommand('SaveWorld').catch(_ => {});
      await sendRconCommand('DoExit');
      rconSuccess = true;
    } catch (rconErr) {
      console.warn('[RESTART RCON FALLBACK FAIL]', rconErr.message);
    }

    await db.query(
      'INSERT INTO audit_logs (user_id, action, ip_address, details) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'RESTART_SERVER', req.ip, `Comando de reinício enviado. Nitrado API: ${apiRestarted ? 'OK' : 'Falha ('+apiError+')'}. RCON: ${rconSuccess ? 'OK' : 'Falha'}.`]
    );

    if (apiRestarted || rconSuccess) {
      return res.status(200).json({
        success: true,
        message: apiRestarted 
          ? 'Servidor colocado para reiniciar via API Nitrado com sucesso!' 
          : 'Servidor colocado para reiniciar via comando Rcon (DoExit) com sucesso!'
      });
    } else {
      return res.status(400).json({
        error: `Não foi possível reiniciar o servidor. Erro API Nitrado: ${apiError || 'Sem credenciais'}. RCON indisponível.`
      });
    }

  } catch (err) {
    console.error('[ADMIN RESTART SERVER ERROR]', err.message);
    res.status(500).json({ error: 'Erro interno ao tentar reiniciar o servidor.' });
  }
});

/**
 * 19. ALTERAR MODO DE JOGO PVP / PVE (Nitrado API com Auto-Restart)
 * POST /api/admin/ark/server/mode
 */
router.post('/ark/server/mode', async (req, res) => {
  const { mode } = req.body;
  if (mode !== 'pvp' && mode !== 'pve') {
    return res.status(400).json({ error: 'Modo inválido. Escolha PVP ou PVE.' });
  }

  try {
    const configs = await db.query(
      "SELECT key, value FROM server_config WHERE key IN ('nitrado_ip', 'nitrado_api_token', 'nitrado_service_id')"
    );
    const configMap = {};
    configs.rows.forEach(row => {
      configMap[row.key] = row.value;
    });

    const ip = configMap['nitrado_ip'] || '127.0.0.1';
    const apiToken = configMap['nitrado_api_token'] || '';
    const serviceId = configMap['nitrado_service_id'] || '';

    // Mock local
    if (ip === '127.0.0.1' || ip === 'localhost') {
      await db.query(
        "INSERT INTO server_config (key, value) VALUES ('mock_server_mode', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        [mode]
      );
      return res.status(200).json({
        success: true,
        message: `Modo de jogo simulado alterado para ${mode.toUpperCase()} com sucesso!`
      });
    }

    if (!apiToken || !serviceId || apiToken.includes('mock-token')) {
      return res.status(400).json({
        error: 'As credenciais da API Nitrado (Token e ID de Serviço) não estão configuradas nas Configurações Globais.'
      });
    }

    const isPve = mode === 'pve';
    const settingsBody = {
      keys: {
        'server-pve': isPve ? 'true' : 'false',
        'disable-pvp': isPve ? 'true' : 'false'
      }
    };

    const response = await fetch(`https://api.nitrado.net/services/${serviceId}/gameservers/settings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(settingsBody)
    });

    const resData = await response.json();

    if (response.ok && resData.status === 'success') {
      await db.query(
        'INSERT INTO audit_logs (user_id, action, ip_address, details) VALUES ($1, $2, $3, $4)',
        [req.user.id, 'CHANGE_SERVER_MODE', req.ip, `Alterou modo do servidor para ${mode.toUpperCase()}.`]
      );

      // Reiniciar para aplicar
      await fetch(`https://api.nitrado.net/services/${serviceId}/gameservers/restart`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiToken}` }
      }).catch(err => console.error('[AUTO RESTART FAIL]', err.message));

      return res.status(200).json({
        success: true,
        message: `Configuração de modo alterada para ${mode.toUpperCase()}! O servidor foi colocado para reiniciar.`
      });
    } else {
      const errMsg = resData.message || 'Erro desconhecido na API Nitrado';
      return res.status(400).json({ error: `Erro na Nitrado: ${errMsg}` });
    }

  } catch (err) {
    console.error('[ADMIN CHANGE MODE ERROR]', err.message);
    res.status(500).json({ error: 'Erro interno ao tentar alternar modo de jogo.' });
  }
});

module.exports = router;
