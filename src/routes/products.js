const express = require('express');
const router = express.Router();
const db = require('../config/db');

/**
 * 1. LISTAR PRODUTOS AGRUPADOS COM VARIAÇÕES
 */
router.get('/', async (req, res) => {
  const { category } = req.query;
  
  try {
    // 1. Buscar produtos pais ativos
    let prodQuery = 'SELECT id, nome as name, slug, categoria as category, descricao as description, imagem_url FROM produtos WHERE ativo = TRUE';
    const params = [];

    if (category) {
      const catLower = category.toLowerCase();
      if (catLower === 'vip') {
        prodQuery += " AND LOWER(categoria) = 'vip'";
      } else if (catLower === 'coins') {
        prodQuery += " AND LOWER(categoria) = 'coins'";
      } else if (catLower === 'kits') {
        prodQuery += " AND LOWER(categoria) IN ('kits', 'kits pvp')";
      } else if (catLower === 'dinos') {
        prodQuery += " AND (LOWER(categoria) LIKE '%dino%' OR LOWER(categoria) IN ('boss', 'tank / soak', 'raid', 'farm', 'farm / transporte', 'mobilidade pvp', 'pvp premium', 'criação / mobilidade'))";
      } else if (catLower === 'items') {
        prodQuery += " AND LOWER(categoria) IN ('recursos', 'tek')";
      } else if (catLower === 'xp') {
        prodQuery += " AND LOWER(categoria) IN ('xp', 'boosters')";
      } else {
        prodQuery += " AND LOWER(categoria) = $1";
        params.push(catLower);
      }
    }

    prodQuery += ' ORDER BY nome ASC';
    const prodsRes = await db.query(prodQuery, params);

    // 2. Buscar variações ativas
    const varsRes = await db.query(
      'SELECT id, produto_id, nome, nome as name, tipo, tipo as type, level, descricao, descricao as description, valor as price, purchase_limit, permite_desconto, permite_desconto as allow_discount, ativo FROM produto_variacoes WHERE ativo = TRUE ORDER BY valor ASC'
    );

    // 3. Agrupar variações sob os produtos correspondentes
    const products = prodsRes.rows.map(prod => {
      const variations = varsRes.rows.filter(v => v.produto_id === prod.id);
      return {
        ...prod,
        variations
      };
    }).filter(prod => prod.variations.length > 0); // Ocultar produtos sem variações ativas

    res.status(200).json({ products });
  } catch (err) {
    console.error('[PRODUCTS GET ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao buscar catálogo de produtos.' });
  }
});

/**
 * 3. RETORNAR CHAVE PÚBLICA DO MERCADO PAGO (Pública para o frontend inicializar o SDK)
 */
router.get('/config/public-key', async (req, res) => {
  try {
    const configRes = await db.query(
      "SELECT value FROM server_config WHERE key = 'mercado_pago_public_key'"
    );
    let publicKey = configRes.rows[0] ? configRes.rows[0].value : '';
    
    // Fallback para variável de ambiente se a chave no banco for vazia ou mock
    if (!publicKey || publicKey.includes('mock')) {
      publicKey = process.env.MERCADO_PAGO_PUBLIC_KEY || publicKey;
    }
    
    res.status(200).json({ publicKey });
  } catch (err) {
    console.error('[PRODUCTS PUBLIC KEY ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao buscar chave pública do Mercado Pago.' });
  }
});

/**
 * 2. OBTER DETALHE DE UMA VARIAÇÃO ESPECÍFICA (Pelo ID da variação)
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const varRes = await db.query(
      `SELECT pv.id, pv.nome, pv.nome as name, pv.tipo, pv.tipo as type, pv.level, pv.descricao, pv.descricao as description, 
              pv.valor as price, pv.purchase_limit, pv.permite_desconto, pv.permite_desconto as allow_discount, pv.ativo, pv.produto_id, 
              p.nome as parent_name, p.categoria as category, p.slug, p.imagem_url
       FROM produto_variacoes pv 
       JOIN produtos p ON pv.produto_id = p.id 
       WHERE pv.id = $1 AND pv.ativo = TRUE`,
      [parseInt(id, 10)]
    );

    if (varRes.rows.length === 0) {
      return res.status(404).json({ error: 'Variação de produto não encontrada ou inativa.' });
    }

    res.status(200).json({ product: varRes.rows[0] });
  } catch (err) {
    console.error('[PRODUCT DETAIL ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao buscar detalhes da variação.' });
  }
});

module.exports = router;
