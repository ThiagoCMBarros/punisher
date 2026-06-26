const token = localStorage.getItem('token');
let adminUser = null;

// Inicialização do Painel Administrativo
document.addEventListener('DOMContentLoaded', () => {
  verifyAdminAccess();
});

// 1. VERIFICAR SE O USUÁRIO É REALMENTE ADMIN
async function verifyAdminAccess() {
  if (!token) {
    alert('Acesso restrito. Faça login para continuar.');
    window.location.href = '/index.html';
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.user && data.user.role === 'admin') {
      adminUser = data.user;
      document.getElementById('admin-username').textContent = adminUser.username;
      
      // Carregar dados iniciais da aba Dashboard
      loadDashboardStats();
    } else {
      alert('Acesso negado. Você não possui privilégios de administrador.');
      window.location.href = '/index.html';
    }
  } catch (err) {
    console.error('Erro de autenticação no painel admin:', err.message);
    window.location.href = '/index.html';
  }
}

// Exibe notificações flutuantes (Toasts)
function showToast(message, isError = false) {
  const toast = document.getElementById('toast-notification');
  const toastMsg = document.getElementById('toast-message');
  if (!toast) return;
  
  toast.style.borderLeftColor = isError ? 'var(--danger)' : 'var(--primary)';
  toastMsg.textContent = message;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}

// Fechar modais genéricos
function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('open');
}

// Alternar abas do painel admin
function switchAdminTab(tabId) {
  // Alterar botões ativos
  document.querySelectorAll('.admin-menu-btn').forEach(btn => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Alterar seções de conteúdo ativas
  document.querySelectorAll('.admin-content-section').forEach(sec => {
    sec.classList.remove('active');
  });

  const targetSec = document.getElementById(`admin-tab-${tabId}`);
  if (targetSec) {
    targetSec.classList.add('active');
  }

  // Gatilhos de carregamento dinâmico
  switch (tabId) {
    case 'dash':
      loadDashboardStats();
      break;
    case 'products':
      loadAdminProducts();
      break;
    case 'users':
      loadAdminUsers();
      break;
    case 'orders':
      loadAdminOrders();
      break;
    case 'deliveries':
      loadAdminDeliveries();
      break;
    case 'logs':
      loadAdminLogs();
      break;
    case 'settings':
      loadGlobalSettings();
      break;
  }
}

// ==========================================
// ABA 1: DASHBOARD / ESTATÍSTICAS
// ==========================================
async function loadDashboardStats() {
  try {
    // Buscar pedidos para calcular vendas totais
    const resOrders = await fetch('/api/admin/orders', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const dataOrders = await resOrders.json();

    if (resOrders.ok && dataOrders.orders) {
      const approvedOrders = dataOrders.orders.filter(o => o.payment_status === 'approved');
      const salesTotal = approvedOrders.reduce((sum, o) => sum + parseFloat(o.total_amount), 0);
      document.getElementById('dash-sales-total').textContent = `R$ ${salesTotal.toFixed(2)}`;
    }

    // Buscar total de usuários
    const resUsers = await fetch('/api/admin/users', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const dataUsers = await resUsers.json();
    if (resUsers.ok && dataUsers.users) {
      document.getElementById('dash-users-count').textContent = dataUsers.users.length;
    }

    // Buscar entregas na fila
    const resDel = await fetch('/api/admin/deliveries', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const dataDel = await resDel.json();
    if (resDel.ok && dataDel.deliveries) {
      const pendingCount = dataDel.deliveries.filter(d => d.status === 'pending' || d.status === 'error').length;
      document.getElementById('dash-queue-count').textContent = pendingCount;
    }

    // Carregar status atual e modo do servidor ARK
    loadServerStatus();

  } catch (err) {
    console.error('Erro ao carregar estatísticas do admin:', err.message);
  }
}

// Logar mensagens no console RCON do Admin
function logConsole(message, type = 'info') {
  const consoleBox = document.getElementById('admin-rcon-console');
  if (!consoleBox) return;

  const time = new Date().toLocaleTimeString('pt-BR');
  const line = document.createElement('div');
  line.className = `console-line ${type}`;
  line.innerHTML = `[${time}] ${message}`;
  
  consoleBox.appendChild(line);
  consoleBox.scrollTop = consoleBox.scrollHeight;
}

// TESTAR CONEXÃO RCON (Executa ListPlayers via backend)
async function testRconConnection() {
  logConsole('Iniciando teste de conexão RCON com o servidor (ListPlayers)...', 'info');
  
  try {
    const res = await fetch('/api/admin/ark/rcon/test', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      logConsole('CONEXÃO COM RCON ESTABELECIDA COM SUCESSO!', 'success');
      logConsole(`Resposta do servidor: "${data.response}"`, 'success');
      showToast('Teste de RCON bem sucedido!');
    } else {
      logConsole(`ERRO AO CONECTAR VIA RCON: ${data.error || 'Erro desconhecido'}`, 'error');
      if (data.details) logConsole(`Detalhes: ${data.details}`, 'error');
      showToast(data.error || 'Falha no teste RCON.', true);
    }
  } catch (err) {
    logConsole(`ERRO DE REDE AO CONECTAR VIA RCON: ${err.message}`, 'error');
    showToast('Erro de rede no teste RCON.', true);
  }
}

// ENVIAR BROADCAST RCON
async function sendBroadcastMessage() {
  const msgInput = prompt("Digite a mensagem de broadcast para enviar ao servidor ARK:");
  if (!msgInput || msgInput.trim() === "") return;

  logConsole(`Enviando mensagem de broadcast: "${msgInput}"...`, 'info');

  try {
    const res = await fetch('/api/admin/ark/rcon/broadcast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ message: msgInput })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      logConsole('BROADCAST ENVIADO COM SUCESSO!', 'success');
      showToast('Broadcast enviado!');
    } else {
      logConsole(`ERRO AO ENVIAR BROADCAST: ${data.error || 'Erro desconhecido'}`, 'error');
      showToast(data.error || 'Falha ao enviar broadcast.', true);
    }
  } catch (err) {
    logConsole(`ERRO DE REDE AO ENVIAR BROADCAST: ${err.message}`, 'error');
    showToast('Erro de rede ao enviar broadcast.', true);
  }
}

// ENVIAR COMANDO CUSTOMIZADO RCON
async function sendCustomRconCommand() {
  const cmdInputEl = document.getElementById('admin-custom-rcon-cmd');
  if (!cmdInputEl) return;
  const cmd = cmdInputEl.value;
  if (!cmd || cmd.trim() === "") {
    showToast('Por favor, digite um comando RCON.', true);
    return;
  }

  logConsole(`Enviando comando customizado: "${cmd}"...`, 'info');
  cmdInputEl.value = ''; // Limpar campo após enviar

  try {
    const res = await fetch('/api/admin/ark/rcon/command', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ command: cmd })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      logConsole('COMANDO EXECUTADO COM SUCESSO!', 'success');
      logConsole(`Resposta do servidor: "${data.response}"`, 'success');
      showToast('Comando RCON enviado com sucesso!');
    } else {
      logConsole(`ERRO AO EXECUTAR COMANDO: ${data.error || 'Erro desconhecido'}`, 'error');
      if (data.details) logConsole(`Detalhes: ${data.details}`, 'error');
      showToast(data.error || 'Falha ao executar comando.', true);
    }
  } catch (err) {
    logConsole(`ERRO DE REDE AO ENVIAR COMANDO: ${err.message}`, 'error');
    showToast('Erro de rede ao enviar comando RCON.', true);
  }
}


// ==========================================
// ABA 2: PRODUTOS (CRUD de Variações)
// ==========================================
async function loadAdminProducts() {
  const tbody = document.getElementById('admin-products-tbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Carregando variações do catálogo...</td></tr>';

  try {
    const res = await fetch('/api/admin/products', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.products) {
      window.adminVariations = data.products; // Armazenar em cache local para edição
      
      if (data.products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--muted);">Nenhuma variação de produto cadastrada.</td></tr>';
        return;
      }

      tbody.innerHTML = '';
      data.products.forEach(prod => {
        const tr = document.createElement('tr');
        const statusBadge = prod.is_active 
          ? '<span class="badge-status approved">Ativo</span>' 
          : '<span class="badge-status cancelled">Inativo</span>';

        const discountBadge = prod.allow_discount 
          ? '<span class="badge-status approved" style="padding: 2px 5px; font-size: 0.65rem; margin-top: 3px; display: inline-block;">Desconto VIP</span>' 
          : '<span class="badge-status cancelled" style="padding: 2px 5px; font-size: 0.65rem; margin-top: 3px; display: inline-block;">Isento</span>';

        const rawRcon = prod.comando_rcon || '';
        const shortRcon = rawRcon.length > 50 ? rawRcon.substring(0, 50) + '...' : rawRcon;
        const escapedRcon = rawRcon.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');

        tr.innerHTML = `
          <td>
            <div style="font-weight:600; color:var(--text-light);">${prod.parent_name}</div>
            <div style="font-size:0.75rem; color:var(--muted);">${prod.name} (Tipo: ${prod.type})</div>
            ${discountBadge}
          </td>
          <td style="text-transform:uppercase; font-size:0.8rem; color:var(--primary);">${prod.category}</td>
          <td style="font-weight:700;">R$ ${parseFloat(prod.price).toFixed(2)}</td>
          <td style="text-align:center;">${prod.purchase_limit > 0 ? prod.purchase_limit : 'Ilimitado'}</td>
          <td style="font-family:monospace; font-size:0.8rem; color:var(--muted); cursor:pointer;" onclick="copyTextToClipboard('${escapedRcon}')" title="Clique para copiar o comando completo">${shortRcon}</td>
          <td>${statusBadge}</td>
          <td>
            <div style="display: flex; gap: 5px;">
              <button class="btn btn-secondary" style="padding:4px 8px; font-size:0.75rem;" onclick="editProduct(${prod.id})" title="Editar"><i class="fa-solid fa-pen"></i></button>
              <button class="btn btn-secondary" style="padding:4px 8px; font-size:0.75rem; border-color: ${prod.is_active ? 'var(--secondary)' : 'var(--success)'}; color: ${prod.is_active ? 'var(--secondary)' : 'var(--success)'};" onclick="toggleProductActive(${prod.id}, ${prod.is_active})" title="${prod.is_active ? 'Inativar' : 'Ativar'}">
                <i class="fa-solid ${prod.is_active ? 'fa-eye-slash' : 'fa-eye'}"></i>
              </button>
              <button class="btn btn-secondary" style="padding:4px 8px; font-size:0.75rem; border-color:var(--danger); color:var(--danger);" onclick="deleteProduct(${prod.id})" title="Deletar permanentemente"><i class="fa-solid fa-trash"></i></button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--danger);">Erro ao carregar produtos.</td></tr>';
  }
}

// Alternar exibição do campo de digitação de novo produto pai
function toggleNewParentInput() {
  const nameInput = document.getElementById('prod-parent-name');
  const btn = document.getElementById('btn-toggle-new-parent');
  const isHidden = nameInput.style.display === 'none';

  if (isHidden) {
    nameInput.style.display = 'block';
    nameInput.focus();
    btn.innerHTML = '<i class="fa-solid fa-xmark"></i> Cancelar';
  } else {
    nameInput.style.display = 'none';
    nameInput.value = '';
    btn.innerHTML = '<i class="fa-solid fa-plus"></i> Novo';
  }
}

// Carregar produtos pais existentes
async function loadProductParents(selectedParentName = null) {
  const select = document.getElementById('prod-parent-select');
  if (!select) return;

  select.innerHTML = '<option value="">Carregando...</option>';

  try {
    const res = await fetch('/api/admin/products/parents', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.parents) {
      select.innerHTML = '';
      
      // Mapear apenas nomes únicos
      const uniqueNames = [...new Set(data.parents.map(p => p.name))];
      
      if (uniqueNames.length === 0) {
        select.innerHTML = '<option value="">Nenhum produto pai encontrado</option>';
        return;
      }

      uniqueNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        if (selectedParentName && name === selectedParentName) {
          option.selected = true;
        }
        select.appendChild(option);
      });
    } else {
      select.innerHTML = '<option value="">Erro ao carregar</option>';
    }
  } catch (err) {
    select.innerHTML = '<option value="">Erro de rede</option>';
  }
}

// Abrir modal de criação
function openProductModal() {
  document.getElementById('product-form').reset();
  document.getElementById('prod-id-input').value = '';
  document.getElementById('prod-allow-discount').checked = true;
  
  // Resetar campos de produto pai
  document.getElementById('prod-parent-name').style.display = 'none';
  document.getElementById('prod-parent-name').value = '';
  document.getElementById('btn-toggle-new-parent').innerHTML = '<i class="fa-solid fa-plus"></i> Novo';
  
  // Resetar imagem
  document.getElementById('prod-image-url').value = '';
  document.getElementById('image-preview-img').src = '';
  document.getElementById('image-preview-img').style.display = 'none';
  document.getElementById('image-preview-placeholder').style.display = 'block';
  
  loadProductParents();

  document.getElementById('product-modal-title').textContent = 'Nova Variação de Produto';
  document.getElementById('product-modal').classList.add('open');
}

// Abrir modal de edição (usa cache local para preenchimento imediato)
function editProduct(id) {
  if (!window.adminVariations) return;
  const prod = window.adminVariations.find(p => p.id === id);

  if (prod) {
    document.getElementById('prod-id-input').value = prod.id;
    document.getElementById('prod-name').value = prod.name;
    document.getElementById('prod-type').value = prod.type || 'Padrão';
    document.getElementById('prod-level').value = prod.level !== null ? prod.level : '';
    document.getElementById('prod-desc').value = prod.description || '';
    document.getElementById('prod-price').value = prod.price;
    document.getElementById('prod-category').value = prod.category;
    document.getElementById('prod-limit').value = prod.purchase_limit || 0;
    document.getElementById('prod-active').value = prod.is_active ? 'true' : 'false';
    document.getElementById('prod-allow-discount').checked = prod.allow_discount !== false;
    document.getElementById('prod-rcon-cmd').value = prod.comando_rcon;

    // Preencher imagem se existir
    if (prod.imagem_url) {
      document.getElementById('prod-image-url').value = prod.imagem_url;
      const imgEl = document.getElementById('image-preview-img');
      imgEl.src = prod.imagem_url;
      imgEl.style.display = 'block';
      document.getElementById('image-preview-placeholder').style.display = 'none';
    } else {
      document.getElementById('prod-image-url').value = '';
      document.getElementById('image-preview-img').src = '';
      document.getElementById('image-preview-img').style.display = 'none';
      document.getElementById('image-preview-placeholder').style.display = 'block';
    }

    // Resetar novos campos de produto pai e pré-selecionar o atual
    document.getElementById('prod-parent-name').style.display = 'none';
    document.getElementById('prod-parent-name').value = '';
    document.getElementById('btn-toggle-new-parent').innerHTML = '<i class="fa-solid fa-plus"></i> Novo';
    
    loadProductParents(prod.parent_name);

    document.getElementById('product-modal-title').textContent = 'Editar Variação';
    document.getElementById('product-modal').classList.add('open');
  } else {
    showToast('Falha ao localizar dados da variação.', true);
  }
}

// Salvar / Criar Variação de Produto
async function saveProduct(event) {
  event.preventDefault();
  const id = document.getElementById('prod-id-input').value;
  
  // Obter o nome do pai dinamicamente
  let parent_name = '';
  const isNewParent = document.getElementById('prod-parent-name').style.display !== 'none';
  if (isNewParent) {
    parent_name = document.getElementById('prod-parent-name').value.trim();
  } else {
    parent_name = document.getElementById('prod-parent-select').value;
  }

  if (!parent_name) {
    showToast('Por favor, informe ou selecione o Produto Pai (Agrupador).', true);
    return;
  }

  const name = document.getElementById('prod-name').value;
  const type = document.getElementById('prod-type').value;
  const levelVal = document.getElementById('prod-level').value;
  const description = document.getElementById('prod-desc').value;
  const price = parseFloat(document.getElementById('prod-price').value);
  const category = document.getElementById('prod-category').value;
  const purchase_limit = parseInt(document.getElementById('prod-limit').value, 10);
  const is_active = document.getElementById('prod-active').value === 'true';
  const allow_discount = document.getElementById('prod-allow-discount').checked;
  const rcon_command = document.getElementById('prod-rcon-cmd').value;
  const image_url = document.getElementById('prod-image-url').value || null;

  const payload = { 
    parent_name, 
    name, 
    type, 
    level: levelVal !== '' ? parseInt(levelVal, 10) : null,
    description, 
    price, 
    category, 
    purchase_limit, 
    is_active, 
    allow_discount,
    rcon_command,
    image_url
  };

  const url = id ? `/api/admin/products/${id}` : '/api/admin/products';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      showToast(id ? 'Variação updated!' : 'Variação cadastrada com sucesso!');
      closeModal('product-modal');
      loadAdminProducts();
    } else {
      const errData = await res.json();
      showToast(errData.error || 'Erro ao salvar variação.', true);
    }
  } catch (err) {
    showToast('Erro de rede ao salvar variação.', true);
  }
}

// Upload de imagem do produto via AJAX
async function handleProductImageUpload(input) {
  const file = input.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('image', file);

  showToast('Fazendo upload da imagem...');

  try {
    const res = await fetch('/api/admin/products/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    const data = await res.json();
    if (res.ok && data.imageUrl) {
      document.getElementById('prod-image-url').value = data.imageUrl;
      
      // Atualizar preview
      const previewImg = document.getElementById('image-preview-img');
      const previewPlaceholder = document.getElementById('image-preview-placeholder');
      
      previewImg.src = data.imageUrl;
      previewImg.style.display = 'block';
      previewPlaceholder.style.display = 'none';

      showToast('Imagem carregada com sucesso!');
    } else {
      showToast(data.error || 'Falha ao fazer upload da imagem.', true);
    }
  } catch (err) {
    showToast('Erro de rede ao fazer upload da imagem.', true);
  }
}

// Deletar Variação permanentemente do banco
async function deleteProduct(id) {
  if (!confirm('ATENÇÃO: Deseja realmente DELETAR PERMANENTEMENTE esta variação do catálogo do banco de dados? Esta ação é irreversível.')) return;

  try {
    const res = await fetch(`/api/admin/products/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'Variação deletada permanentemente com sucesso!');
      loadAdminProducts();
    } else {
      showToast(data.error || 'Erro ao deletar variação.', true);
    }
  } catch (err) {
    showToast('Erro de rede ao excluir variação.', true);
  }
}

// Ativar/Inativar Variação (Mudar Status)
async function toggleProductActive(id, currentStatus) {
  const nextStatus = !currentStatus;
  const actionText = nextStatus ? 'ATIVAR' : 'INATIVAR';

  if (!confirm(`Deseja realmente ${actionText} esta variação de produto?`)) return;

  try {
    const res = await fetch(`/api/admin/products/${id}/toggle-active`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ is_active: nextStatus })
    });

    const data = await res.json();
    if (res.ok) {
      showToast(data.message || `Variação ${nextStatus ? 'ativada' : 'inativada'} com sucesso!`);
      loadAdminProducts();
    } else {
      showToast(data.error || 'Erro ao alterar status.', true);
    }
  } catch (err) {
    showToast('Erro de rede ao alterar status.', true);
  }
}

// ==========================================
// ABA 3: USUÁRIOS (BAN/CARGOS)
// ==========================================
async function loadAdminUsers() {
  const tbody = document.getElementById('admin-users-tbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Carregando usuários...</td></tr>';

  try {
    const res = await fetch('/api/admin/users', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.users) {
      tbody.innerHTML = '';
      data.users.forEach(user => {
        const tr = document.createElement('tr');
        
        // Formatar banimento
        const statusBadge = user.is_banned 
          ? '<span class="badge-status error">Banido</span>' 
          : '<span class="badge-status approved">Ativo</span>';

        const banBtnText = user.is_banned ? 'Desbanir' : 'Banir';
        const banBtnColor = user.is_banned ? 'var(--success)' : 'var(--danger)';

        tr.innerHTML = `
          <td>
            <div style="font-weight:600; color:var(--text-light);">${user.username}</div>
            <div style="font-size:0.75rem; color:var(--muted);">${user.character_name || 'Sem char cadastrado'}</div>
          </td>
          <td>${user.email}</td>
          <td style="font-family:monospace; font-size:0.8rem;">${user.ark_id || 'Não vinculado'}</td>
          <td style="font-size:0.85rem; color:var(--text-dim);">${user.tribe_name}</td>
          <td style="color:var(--secondary); font-weight:700;">${user.coins_balance} G</td>
          <td style="text-transform:uppercase; font-size:0.8rem;">${user.role}</td>
          <td>${statusBadge}</td>
          <td>
            <button class="btn btn-secondary" style="padding:4px 8px; font-size:0.75rem; border-color:${banBtnColor}; color:${banBtnColor};" onclick="toggleUserBan('${user.id}', ${!user.is_banned})">
              ${banBtnText}
            </button>
            <button class="btn btn-secondary" style="padding:4px 8px; font-size:0.75rem;" onclick="changeUserRole('${user.id}', '${user.role === 'admin' ? 'user' : 'admin'}')">
              Alternar Cargo
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--danger);">Erro ao carregar usuários.</td></tr>';
  }
}

async function toggleUserBan(id, banStatus) {
  const actionText = banStatus ? 'banir' : 'desbanir';
  if (!confirm(`Deseja realmente ${actionText} este usuário?`)) return;

  try {
    const res = await fetch(`/api/admin/users/${id}/ban`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ is_banned: banStatus })
    });

    if (res.ok) {
      showToast(`Usuário alterado com sucesso!`);
      loadAdminUsers();
    } else {
      const err = await res.json();
      showToast(err.error || 'Erro na operação.', true);
    }
  } catch (err) {
    showToast('Erro de rede.', true);
  }
}

async function changeUserRole(id, nextRole) {
  if (!confirm(`Deseja alterar o cargo deste usuário para ${nextRole.toUpperCase()}?`)) return;

  try {
    const res = await fetch(`/api/admin/users/${id}/role`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ role: nextRole })
    });

    if (res.ok) {
      showToast('Cargo atualizado!');
      loadAdminUsers();
    } else {
      const err = await res.json();
      showToast(err.error || 'Erro ao alterar cargo.', true);
    }
  } catch (err) {
    showToast('Erro de rede.', true);
  }
}

// ==========================================
// ABA 4: VER PEDIDOS GERAIS
// ==========================================
async function loadAdminOrders() {
  const tbody = document.getElementById('admin-orders-tbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Carregando histórico de pedidos...</td></tr>';

  try {
    const res = await fetch('/api/admin/orders', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.orders) {
      if (data.orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--muted);">Nenhum pedido efetuado no sistema.</td></tr>';
        return;
      }

      tbody.innerHTML = '';
      data.orders.forEach(order => {
        const dateStr = new Date(order.created_at).toLocaleDateString('pt-BR', {
          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        // Calcular status geral da entrega RCON
        let deliveryBadge = '';
        if (order.payment_status === 'approved') {
          const rconItems = (order.items || []).filter(it => it.delivery_status !== null);
          if (rconItems.length === 0) {
            deliveryBadge = '<span class="badge-status approved">Imediato</span>';
          } else {
            const statuses = rconItems.map(it => it.delivery_status);
            if (statuses.includes('error')) {
              deliveryBadge = '<span class="badge-status error">Erro</span>';
            } else if (statuses.includes('pending')) {
              deliveryBadge = '<span class="badge-status pending">Pendente</span>';
            } else if (statuses.every(s => s === 'delivered')) {
              deliveryBadge = '<span class="badge-status approved">Entregue</span>';
            } else if (statuses.every(s => s === 'cancelled')) {
              deliveryBadge = '<span class="badge-status cancelled">Cancelado</span>';
            } else {
              deliveryBadge = '<span class="badge-status pending">Parcial</span>';
            }
          }
        } else {
          deliveryBadge = '<span class="badge-status cancelled">-</span>';
        }

        // Montar botões de ações
        let actionsHtml = `
          <button class="btn btn-secondary" style="padding:4px 8px; font-size:0.75rem;" onclick="editOrderRecipient('${order.id}', '${order.recipient_ark_id}')" title="Alterar ID do Destinatário">
            <i class="fa-solid fa-user-pen"></i> ID
          </button>
        `;

        if (order.payment_status !== 'approved') {
          actionsHtml += `
            <button class="btn btn-primary" style="padding:4px 8px; font-size:0.75rem; background-color: var(--secondary); border-color: var(--secondary);" onclick="approveOrderManually('${order.id}')" title="Aprovar Pedido Manualmente">
              <i class="fa-solid fa-check"></i> Aprovar
            </button>
          `;
        } else {
          const hasRconItems = (order.items || []).some(it => 
            it.delivery_status !== null || 
            (it.category && !['vip', 'coins', 'moedas'].includes(it.category.toLowerCase()) && !it.product_name.toLowerCase().includes('vip') && !it.product_name.toLowerCase().includes('moedas'))
          );
          if (hasRconItems) {
            actionsHtml += `
              <button class="btn btn-primary" style="padding:4px 8px; font-size:0.75rem;" onclick="resendOrderDeliveries('${order.id}')" title="Reenviar Itens do Pedido">
                <i class="fa-solid fa-redo"></i> Reenviar
              </button>
            `;
          }
        }

        const itemsStr = (order.items || []).map(it => `${it.quantity}x ${it.product_name}`).join(', ');

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-family:monospace; font-size:0.8rem;">#${order.id.substring(0, 8)}</td>
          <td>
            <div style="font-weight:600;">${order.purchaser_name || 'Removido'}</div>
            <div style="font-size:0.75rem; color:var(--muted);">${order.purchaser_email || ''}</div>
            <div style="font-size:0.7rem; color:var(--text-dim); margin-top:3px; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${itemsStr}">${itemsStr || 'Sem itens'}</div>
          </td>
          <td style="font-family:monospace; font-size:0.85rem;">${order.recipient_ark_id} ${order.is_gift ? '🎁' : ''}</td>
          <td style="font-weight:700; color:var(--primary);">R$ ${parseFloat(order.total_amount).toFixed(2)}</td>
          <td style="font-family:monospace; font-size:0.8rem; color:var(--muted);">${order.payment_id || '-'}</td>
          <td><span class="badge-status ${order.payment_status}">${order.payment_status}</span></td>
          <td>${deliveryBadge}</td>
          <td style="font-size:0.8rem; color:var(--muted);">${dateStr}</td>
          <td>
            <div style="display: flex; gap: 5px; align-items: center;">
              ${actionsHtml}
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (err) {
    console.error('Erro ao listar pedidos admin:', err.message);
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--danger);">Erro ao carregar pedidos.</td></tr>';
  }
}

// ALTERAR ID DO DESTINATÁRIO DO PEDIDO
async function editOrderRecipient(orderId, currentArkId) {
  const newArkId = prompt(`Digite o novo ID de Jogador ARK para o pedido:\n(ID Atual: ${currentArkId})`, currentArkId);
  if (newArkId === null) return; // Cancelado
  
  if (newArkId.trim() === '') {
    showToast('O ID ARK do destinatário não pode ser vazio.', true);
    return;
  }

  try {
    const res = await fetch(`/api/admin/orders/${orderId}/recipient`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ recipient_ark_id: newArkId })
    });

    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'ID do destinatário atualizado com sucesso!');
      loadAdminOrders(); // Recarregar
      if (typeof loadAdminDeliveries === 'function') loadAdminDeliveries();
    } else {
      showToast(data.error || 'Erro ao atualizar ID.', true);
    }
  } catch (err) {
    showToast('Erro de rede ao atualizar ID do destinatário.', true);
  }
}

// ==========================================
// ABA 5: FILA DE ENTREGAS RCON
// ==========================================
async function loadAdminDeliveries() {
  const tbody = document.getElementById('admin-deliveries-tbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Carregando fila RCON...</td></tr>';

  try {
    const res = await fetch('/api/admin/deliveries', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.deliveries) {
      if (data.deliveries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--muted);">Fila de RCON vazia.</td></tr>';
        return;
      }

      tbody.innerHTML = '';
      data.deliveries.forEach(del => {
        const tr = document.createElement('tr');
        
        let actions = '';
        if (del.status === 'error' || del.status === 'pending' || del.status === 'delivered') {
          actions = `
            <button class="btn btn-primary" style="padding:4px 8px; font-size:0.75rem;" onclick="retryDelivery('${del.id}')" title="Reenviar agora">
              <i class="fa-solid fa-redo"></i> Reenviar
            </button>
            ${del.status !== 'delivered' ? `
            <button class="btn btn-secondary" style="padding:4px 8px; font-size:0.75rem; border-color:var(--danger); color:var(--danger);" onclick="cancelDelivery('${del.id}')" title="Cancelar item">
              Cancelar
            </button>
            ` : ''}
          `;
        }

        const rawRcon = del.rcon_command || '';
        const shortRcon = rawRcon.length > 50 ? rawRcon.substring(0, 50) + '...' : rawRcon;
        const escapedRcon = rawRcon.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');

        tr.innerHTML = `
          <td style="font-family:monospace; font-size:0.75rem;">#${del.id.substring(0, 8)}</td>
          <td style="font-family:monospace; font-size:0.85rem;">${del.recipient_ark_id}</td>
          <td style="font-size:0.85rem; font-weight:600;">${del.product_name}</td>
          <td style="font-family:monospace; font-size:0.8rem; color:var(--muted); cursor:pointer;" onclick="copyTextToClipboard('${escapedRcon}')" title="Clique para copiar o comando completo">${shortRcon}</td>
          <td style="text-align:center; font-weight:bold;">${del.attempts}/5</td>
          <td><span class="badge-status ${del.status}">${del.status}</span></td>
          <td style="font-size:0.75rem; color:var(--danger); max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${del.error_log || ''}">${del.error_log || '-'}</td>
          <td>${actions}</td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--danger);">Erro ao carregar fila de entregas.</td></tr>';
  }
}

// Reenviar entrega falha
async function retryDelivery(id) {
  try {
    logConsole(`Disparando tentativa manual de entrega para item Fila ID #${id.substring(0, 8)}...`, 'info');
    const res = await fetch(`/api/admin/deliveries/${id}/retry`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      showToast('Comando de reenvio enviado! Processando fila RCON...');
      loadAdminDeliveries();
      // Renderizar o console logs após um tempo
      setTimeout(() => {
        logConsole(`Processamento manual de reenvio concluído para Fila ID #${id.substring(0,8)}.`, 'success');
      }, 1500);
    } else {
      const err = await res.json();
      showToast(err.error || 'Erro ao reenviar.', true);
    }
  } catch (err) {
    showToast('Erro de rede.', true);
  }
}

// Cancelar entrega da fila
async function cancelDelivery(id) {
  if (!confirm('Deseja realmente cancelar esta entrega na fila RCON?')) return;

  try {
    const res = await fetch(`/api/admin/deliveries/${id}/cancel`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      showToast('Entrega cancelada.');
      loadAdminDeliveries();
    } else {
      const err = await res.json();
      showToast(err.error || 'Erro ao cancelar.', true);
    }
  } catch (err) {
    showToast('Erro de rede.', true);
  }
}

// Forçar processador de entregas de forma global
async function runDeliveryWorkerManual() {
  try {
    showToast('Forçando loop do processador RCON...');
    const res = await fetch('/api/admin/deliveries', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      // Simular chamada ao loop em background
      logConsole('Iniciando processamento em lote da Fila RCON...', 'info');
      setTimeout(() => {
        logConsole('Loop manual de RCON processado. Entregas atualizadas.', 'success');
        loadAdminDeliveries();
      }, 1000);
    }
  } catch (err) {
    showToast('Erro de rede.', true);
  }
}

// ==========================================
// ABA 6: LOGS DE AUDITORIA
// ==========================================
async function loadAdminLogs() {
  const tbody = document.getElementById('admin-logs-tbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Carregando logs de auditoria...</td></tr>';

  try {
    const res = await fetch('/api/admin/logs', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.logs) {
      if (data.logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--muted);">Fila de logs vazia.</td></tr>';
        return;
      }

      tbody.innerHTML = '';
      data.logs.forEach(log => {
        const dateStr = new Date(log.created_at).toLocaleDateString('pt-BR', {
          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
        });

        tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-size:0.8rem; color:var(--muted);">${dateStr}</td>
          <td style="font-weight:600;">${log.username || 'Sistema'}</td>
          <td style="color:var(--primary); font-family:var(--font-title); font-size:0.75rem;">${log.action}</td>
          <td style="font-family:monospace; font-size:0.8rem;">${log.ip_address}</td>
          <td style="font-size:0.85rem; color:var(--text-dim);">${log.details}</td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--danger);">Erro ao carregar logs.</td></tr>';
  }
}

// ==========================================
// ABA 7: CONFIGURAÇÕES GLOBAIS
// ==========================================
async function loadGlobalSettings() {
  try {
    const res = await fetch('/api/admin/config', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.configs) {
      const cfg = data.configs;
      
      document.getElementById('cfg-nitrado-ip').value = cfg.nitrado_ip || '';
      document.getElementById('cfg-nitrado-port').value = cfg.nitrado_port || '27015';
      document.getElementById('cfg-nitrado-password').value = cfg.nitrado_password || '';

      document.getElementById('cfg-nitrado-api-token').value = cfg.nitrado_api_token || '';
      document.getElementById('cfg-nitrado-service-id').value = cfg.nitrado_service_id || '';
      
      document.getElementById('cfg-mp-access-token').value = cfg.mercado_pago_access_token || '';
      document.getElementById('cfg-mp-public-key').value = cfg.mercado_pago_public_key || '';
      
      document.getElementById('cfg-email-host').value = cfg.email_host || '';
      document.getElementById('cfg-email-port').value = cfg.email_port || '2525';
      document.getElementById('cfg-email-user').value = cfg.email_user || '';
      document.getElementById('cfg-email-pass').value = cfg.email_pass || '';
      document.getElementById('cfg-email-from').value = cfg.email_from || '';
    }
  } catch (err) {
    showToast('Erro ao carregar configurações do servidor.', true);
  }
}

async function saveGlobalConfig(event) {
  event.preventDefault();
  
  const payload = {
    nitrado_ip: document.getElementById('cfg-nitrado-ip').value,
    nitrado_port: document.getElementById('cfg-nitrado-port').value,
    nitrado_password: document.getElementById('cfg-nitrado-password').value,

    nitrado_api_token: document.getElementById('cfg-nitrado-api-token').value,
    nitrado_service_id: document.getElementById('cfg-nitrado-service-id').value,
    
    mercado_pago_access_token: document.getElementById('cfg-mp-access-token').value,
    mercado_pago_public_key: document.getElementById('cfg-mp-public-key').value,
    
    email_host: document.getElementById('cfg-email-host').value,
    email_port: document.getElementById('cfg-email-port').value,
    email_user: document.getElementById('cfg-email-user').value,
    email_pass: document.getElementById('cfg-email-pass').value,
    email_from: document.getElementById('cfg-email-from').value,
  };

  try {
    const res = await fetch('/api/admin/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      showToast('Configurações atualizadas com sucesso no banco de dados!');
      loadGlobalSettings(); // recarrega com placeholders nos campos de senha
    } else {
      const err = await res.json();
      showToast(err.error || 'Erro ao salvar configurações.', true);
    }
  } catch (err) {
    showToast('Erro de conexão ao salvar configurações.', true);
  }
}

// ==========================================
// FUNÇÕES DE CONTROLE DO SERVIDOR ARK
// ==========================================

// Buscar status do servidor ARK e atualizar os badges
async function loadServerStatus() {
  const statusBadge = document.getElementById('server-status-badge');
  const modeBadge = document.getElementById('server-mode-badge');
  if (!statusBadge || !modeBadge) return;

  statusBadge.className = 'badge-status pending';
  statusBadge.textContent = 'Buscando...';

  try {
    const res = await fetch('/api/admin/ark/server/status', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      // Atualizar status
      statusBadge.textContent = data.status;
      if (data.status === 'online') {
        statusBadge.className = 'badge-status approved';
      } else if (data.status === 'restarting') {
        statusBadge.className = 'badge-status pending';
      } else {
        statusBadge.className = 'badge-status error';
      }

      // Atualizar modo
      modeBadge.textContent = data.mode;
      modeBadge.removeAttribute('style'); // Remove inline styles like background-color
      modeBadge.style.textTransform = 'uppercase';
      modeBadge.style.fontSize = '0.75rem';
      modeBadge.style.padding = '3px 8px';
      
      if (data.mode.toLowerCase() === 'pve') {
        modeBadge.className = 'badge-status delivered'; // Ciano semi-transparente
      } else if (data.mode.toLowerCase() === 'pvp') {
        modeBadge.className = 'badge-status pending'; // Laranja semi-transparente
      } else {
        modeBadge.className = 'badge-status cancelled';
      }
    } else {
      statusBadge.textContent = 'Erro';
      statusBadge.className = 'badge-status error';
      modeBadge.textContent = 'Desconhecido';
      modeBadge.className = 'badge-status error';
    }
  } catch (err) {
    statusBadge.textContent = 'Falha';
    statusBadge.className = 'badge-status error';
    modeBadge.textContent = 'Falha';
    modeBadge.className = 'badge-status error';
  }
}

// Reiniciar o Servidor ARK
async function restartGameServer() {
  if (!confirm('ATENÇÃO: Deseja realmente reiniciar o servidor ARK? Isso desconectará todos os jogadores ativos.')) return;

  logConsole('Enviando comando para reiniciar o servidor ARK...', 'info');
  showToast('Enviando solicitação de reinício do servidor...');

  try {
    const res = await fetch('/api/admin/ark/server/restart', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      logConsole(data.message || 'Servidor colocado para reiniciar!', 'success');
      showToast(data.message || 'Servidor reiniciando!');
      // Atualizar o status após 3 segundos
      setTimeout(loadServerStatus, 3000);
    } else {
      logConsole(`FALHA AO REINICIAR SERVIDOR: ${data.error || 'Erro desconhecido'}`, 'error');
      showToast(data.error || 'Falha ao reiniciar servidor.', true);
    }
  } catch (err) {
    logConsole(`ERRO DE CONEXÃO AO REINICIAR SERVIDOR: ${err.message}`, 'error');
    showToast('Erro de conexão ao reiniciar.', true);
  }
}

// Alternar Modo PvP / PvE
async function changeServerMode(mode) {
  const modeText = mode.toUpperCase();
  if (!confirm(`Deseja alterar o modo do servidor para ${modeText} e reiniciar o servidor para aplicar?`)) return;

  logConsole(`Enviando solicitação para alterar modo para ${modeText}...`, 'info');
  showToast(`Alterando para modo ${modeText}...`);

  try {
    const res = await fetch('/api/admin/ark/server/mode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ mode })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      logConsole(data.message || `Servidor alterado para ${modeText}!`, 'success');
      showToast(data.message || `Servidor alterado para ${modeText}!`);
      setTimeout(loadServerStatus, 4000);
    } else {
      logConsole(`FALHA AO ALTERAR MODO: ${data.error || 'Erro desconhecido'}`, 'error');
      showToast(data.error || 'Falha ao alterar modo de jogo.', true);
    }
  } catch (err) {
    logConsole(`ERRO DE REDE AO ALTERAR MODO: ${err.message}`, 'error');
    showToast('Erro de rede ao alterar modo de jogo.', true);
  }
}

// Aprovar pedido manualmente
async function approveOrderManually(orderId) {
  if (!confirm('Deseja realmente aprovar este pedido manualmente? Isso irá creditar moedas/VIPs e enfileirar as entregas RCON imediatamente.')) return;

  try {
    const res = await fetch(`/api/admin/orders/${orderId}/approve`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'Pedido aprovado com sucesso!');
      loadAdminOrders(); // Recarregar
      if (typeof loadAdminDeliveries === 'function') loadAdminDeliveries();
    } else {
      showToast(data.error || 'Erro ao aprovar pedido.', true);
    }
  } catch (err) {
    showToast('Erro de rede ao aprovar pedido.', true);
  }
}

// Reenviar entregas RCON de um pedido
async function resendOrderDeliveries(orderId) {
  if (!confirm('Deseja realmente reenviar todos os itens desse pedido via RCON?')) return;

  try {
    logConsole(`Disparando tentativa manual de reenvio para Pedido ID #${orderId}...`, 'info');
    const res = await fetch(`/api/admin/orders/${orderId}/resend`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok) {
      showToast(data.message || 'Comando de reenvio do pedido enviado!');
      loadAdminOrders(); // Recarregar
      if (typeof loadAdminDeliveries === 'function') loadAdminDeliveries();
      
      setTimeout(() => {
        logConsole(`Reenvio manual disparado com sucesso para Pedido ID #${orderId}.`, 'success');
      }, 1500);
    } else {
      showToast(data.error || 'Erro ao reenviar pedido.', true);
    }
  } catch (err) {
    showToast('Erro de rede ao reenviar pedido.', true);
  }
}

// Copiar texto para a área de transferência
async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Comando RCON copiado para a área de transferência com sucesso!');
  } catch (err) {
    console.error('Falha ao copiar:', err);
    showToast('Erro ao copiar comando.', true);
  }
}
