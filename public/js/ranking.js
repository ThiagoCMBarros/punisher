let currentRankingType = 'players'; // 'players' ou 'tribes'

// ALTERAR ENTRE ABAS DO RANKING
function switchRankingType(type) {
  currentRankingType = type;
  
  const playersTab = document.getElementById('rank-tab-players');
  const tribesTab = document.getElementById('rank-tab-tribes');
  const sortContainer = document.getElementById('player-rank-sort-options');

  if (type === 'players') {
    playersTab.classList.add('active');
    tribesTab.classList.remove('active');
    sortContainer.style.display = 'block';
    loadPlayerRanking();
  } else {
    playersTab.classList.remove('active');
    tribesTab.classList.add('active');
    sortContainer.style.display = 'none';
    loadTribeRanking();
  }
}

// CARREGAR RANKING DE JOGADORES DO BANCO DE DADOS
async function loadPlayerRanking() {
  const tableHead = document.querySelector('#ranking-table others') || document.querySelector('#ranking-table thead');
  const tableBody = document.getElementById('ranking-table-body');
  const sortBy = document.getElementById('rank-sort-select').value;

  if (!tableBody || !tableHead) return;

  tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 1.5rem; color: var(--primary);"></i></td></tr>';

  try {
    const res = await fetch(`/api/ranking/players?sort=${sortBy}`);
    const data = await res.json();

    if (res.ok && data.players) {
      // Configurar Cabeçalho da Tabela para Jogadores
      tableHead.innerHTML = `
        <tr>
          <th style="width: 70px; text-align: center;">Pos</th>
          <th>Sobrevivente</th>
          <th>Tribo</th>
          <th style="text-align: center;">Level</th>
          <th style="text-align: center;">Kills / Deaths</th>
          <th style="text-align: center;">K/D Ratio</th>
          <th style="text-align: center;">Tempo Jogado</th>
          <th style="text-align: center;">VIP</th>
        </tr>
      `;

      if (data.players.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--muted);">Nenhum jogador encontrado.</td></tr>';
        return;
      }

      tableBody.innerHTML = '';
      data.players.forEach((player, index) => {
        const pos = index + 1;
        const kdRatio = player.deaths > 0 ? (player.kills / player.deaths).toFixed(2) : player.kills.toFixed(2);
        
        // Formatar Badge VIP
        let vipBadgeStr = '<span style="color: var(--muted); font-size: 0.8rem;">Membro</span>';
        if (player.vip_status && player.vip_status !== 'Membro') {
          const vipClass = player.vip_status.toLowerCase().includes('ouro') ? 'ouro' : player.vip_status.toLowerCase().includes('prata') ? 'prata' : 'bronze';
          vipBadgeStr = `<span class="badge-vip ${vipClass}">${player.vip_status}</span>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="rank-position pos-${pos}">${pos}</td>
          <td>
            <div style="font-weight: 700; color: var(--text-light);">${player.character_name || 'Sobrevivente'}</div>
            <div style="font-size: 0.75rem; color: var(--muted);">@${player.username}</div>
          </td>
          <td style="color: var(--text-dim); font-size: 0.85rem;">${player.tribe_name || 'Sem Tribo'}</td>
          <td style="text-align: center; font-weight: 600; color: var(--primary);">${player.character_level}</td>
          <td style="text-align: center; font-size: 0.85rem;">${player.kills} / ${player.deaths}</td>
          <td style="text-align: center; font-weight: 700; font-size: 0.85rem; color: ${parseFloat(kdRatio) >= 1.0 ? 'var(--success)' : 'var(--muted)'};">${kdRatio}</td>
          <td style="text-align: center; font-size: 0.85rem; color: var(--text-dim);">${player.playtime_hours}h</td>
          <td style="text-align: center;">${vipBadgeStr}</td>
        `;
        tableBody.appendChild(tr);
      });
      
      // Atualizar destaques da primeira aba (Home) caso os elementos existam e o ranking seja o padrão de kills
      if (sortBy === 'kills' && data.players.length > 0) {
        updateHomeHighlights(data.players[0]);
      }
    }
  } catch (err) {
    tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--danger);">Erro de rede ao buscar ranking.</td></tr>';
  }
}

// CARREGAR RANKING DE TRIBOS
async function loadTribeRanking() {
  const tableHead = document.querySelector('#ranking-table thead');
  const tableBody = document.getElementById('ranking-table-body');

  if (!tableBody || !tableHead) return;

  tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 1.5rem; color: var(--primary);"></i></td></tr>';

  try {
    const res = await fetch('/api/ranking/tribes');
    const data = await res.json();

    if (res.ok && data.tribes) {
      // Configurar Cabeçalho da Tabela para Tribos
      tableHead.innerHTML = `
        <tr>
          <th style="width: 70px; text-align: center;">Pos</th>
          <th>Nome da Tribo</th>
          <th style="text-align: center;">Membros Ativos</th>
          <th style="text-align: center;">Kills Totais</th>
          <th style="text-align: center;">Nível Médio</th>
          <th style="text-align: center;">Tempo Acumulado</th>
        </tr>
      `;

      if (data.tribes.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--muted);">Nenhuma tribo encontrada.</td></tr>';
        return;
      }

      tableBody.innerHTML = '';
      data.tribes.forEach((tribe, index) => {
        const pos = index + 1;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="rank-position pos-${pos}">${pos}</td>
          <td style="font-weight: 700; color: var(--text-light); font-size: 1rem;">
            <i class="fa-solid fa-shield-halved" style="color: var(--secondary); margin-right: 8px;"></i>${tribe.tribe_name}
          </td>
          <td style="text-align: center; font-weight: 600;">${tribe.members_count}</td>
          <td style="text-align: center; color: var(--danger); font-weight: bold;">${tribe.total_kills}</td>
          <td style="text-align: center; color: var(--primary);">${tribe.avg_level}</td>
          <td style="text-align: center; color: var(--text-dim); font-size: 0.85rem;">${tribe.total_playtime}h</td>
        `;
        tableBody.appendChild(tr);
      });
      
      // Atualizar tribo em destaque na Home
      if (data.tribes.length > 0) {
        const dominantTribeEl = document.getElementById('dominant-tribe-name');
        const dominantTribeStatEl = document.getElementById('dominant-tribe-stat');
        if (dominantTribeEl) dominantTribeEl.textContent = data.tribes[0].tribe_name;
        if (dominantTribeStatEl) dominantTribeStatEl.innerHTML = `<i class="fa-solid fa-hourglass-half"></i> ${data.tribes[0].total_playtime}h de Atividade acumulada`;
      }
    }
  } catch (err) {
    tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--danger);">Erro de rede ao buscar ranking.</td></tr>';
  }
}

// ATUALIZAR HIGHLIGHTS DA PÁGINA INICIAL COM O JOGADOR MVP
function updateHomeHighlights(mvpPlayer) {
  const mvpEl = document.getElementById('mvp-player-name');
  const mvpStatEl = document.getElementById('mvp-player-stat');
  
  if (mvpEl && mvpPlayer) {
    mvpEl.textContent = mvpPlayer.character_name || mvpPlayer.username;
    mvpStatEl.innerHTML = `<i class="fa-solid fa-skull"></i> ${mvpPlayer.kills} Kills no PvP (Lvl ${mvpPlayer.character_level})`;
  }
}
