const express = require('express');
const router = express.Router();
const db = require('../config/db');

/**
 * 1. RANKING DE JOGADORES (Dinâmico)
 * Parâmetro 'sort' define ordenação: 'kills', 'level', 'playtime', 'coins'
 */
router.get('/players', async (req, res) => {
  const sortBy = req.query.sort || 'kills';
  
  // Validar campos de ordenação permitidos para evitar SQL Injection
  const allowedSorts = {
    kills: 'kills DESC',
    level: 'character_level DESC',
    playtime: 'playtime_hours DESC',
    coins: 'coins_balance DESC'
  };

  const orderClause = allowedSorts[sortBy] || 'kills DESC';

  try {
    // Buscar se rankings estão ativos nas configurações globais
    const configRes = await db.query(
      "SELECT key, value FROM server_config WHERE key LIKE 'rank_show_%'"
    );
    const config = {};
    configRes.rows.forEach(row => {
      config[row.key] = row.value === 'true';
    });

    // Query de jogadores (exclui admins e banidos)
    const queryStr = `
      SELECT username, character_name, character_level, kills, deaths, 
             playtime_hours, coins_balance, vip_status, tribe_name
      FROM users 
      WHERE role <> 'admin' AND is_banned = FALSE
      ORDER BY ${orderClause}
      LIMIT 50
    `;

    const rankingRes = await db.query(queryStr);
    
    res.status(200).json({
      config,
      players: rankingRes.rows
    });
  } catch (err) {
    console.error('[RANKING PLAYERS ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao obter ranking de jogadores.' });
  }
});

/**
 * 2. RANKING DE TRIBOS (Agrupado dinamicamente a partir dos sobreviventes)
 */
router.get('/tribes', async (req, res) => {
  try {
    const queryStr = `
      SELECT tribe_name,
             COUNT(*) as members_count,
             SUM(kills) as total_kills,
             SUM(playtime_hours) as total_playtime,
             ROUND(AVG(character_level)) as avg_level
      FROM users
      WHERE tribe_name IS NOT NULL 
        AND tribe_name <> 'Sem Tribo' 
        AND tribe_name <> 'Solo'
        AND is_banned = FALSE
      GROUP BY tribe_name
      ORDER BY total_kills DESC, total_playtime DESC
      LIMIT 20
    `;

    const tribesRes = await db.query(queryStr);
    
    res.status(200).json({
      tribes: tribesRes.rows.map(row => ({
        tribe_name: row.tribe_name,
        members_count: parseInt(row.members_count, 10),
        total_kills: parseInt(row.total_kills || 0, 10),
        total_playtime: parseInt(row.total_playtime || 0, 10),
        avg_level: parseInt(row.avg_level || 0, 10)
      }))
    });
  } catch (err) {
    console.error('[RANKING TRIBES ERROR]', err.message);
    res.status(500).json({ error: 'Erro ao obter ranking de tribos.' });
  }
});

module.exports = router;
