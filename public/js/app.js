// Variáveis Globais de Estado do Cliente
let currentUser = null;
let currentToken = localStorage.getItem('token') || null;

// Inicialização da Página
document.addEventListener('DOMContentLoaded', () => {
  // Verificar sessão ativa
  verifySession();

  // Ouvir parâmetros da URL (Confirmação de e-mail e redefinição de senha)
  handleUrlParams();

  // Inicializar acordeão de regras
  initAccordions();

  // Carregar produtos em destaque na Home
  loadHomePromotions();
});

// Exibe notificações flutuantes (Toasts)
function showToast(message, isError = false) {
  const toast = document.getElementById('toast-notification');
  const toastMsg = document.getElementById('toast-message');
  
  toast.style.borderLeftColor = isError ? 'var(--danger)' : 'var(--primary)';
  toastMsg.textContent = message;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}

// Alternar abas do SPA (Single Page Application)
function switchView(viewId) {
  // Ocultar todas as abas
  document.querySelectorAll('.view-section').forEach(sec => {
    sec.classList.remove('active');
  });

  // Ativar aba correspondente
  const targetSec = document.getElementById(`view-section-${viewId}`) || document.getElementById(`view-${viewId}`);
  if (targetSec) {
    targetSec.classList.add('active');
  }

  // Atualizar classe ativa na barra de navegação
  document.querySelectorAll('nav .nav-link').forEach(link => {
    if (link.getAttribute('data-view') === viewId) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Fechar o carrinho se estiver aberto ao trocar de aba
  const cart = document.getElementById('cart-drawer');
  if (cart) cart.classList.remove('open');

  // Gatilhos de carregamento sob demanda
  if (viewId === 'store') {
    if (typeof loadCatalog === 'function') loadCatalog();
  } else if (viewId === 'ranking') {
    if (typeof loadPlayerRanking === 'function') loadPlayerRanking();
  } else if (viewId === 'profile') {
    if (currentUser) {
      loadProfileData();
      if (typeof loadOrderHistory === 'function') loadOrderHistory();
    } else {
      switchView('auth');
      showToast('Faça login para acessar seu perfil.', true);
    }
  }
}

// Fechar modais genéricos
function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('open');
}

// Copiar endereço IP do servidor
function copyServerIP() {
  const ipText = document.getElementById('server-ip').textContent;
  navigator.clipboard.writeText(ipText).then(() => {
    showToast('IP do Servidor copiado com sucesso!');
  }).catch(() => {
    showToast('Não foi possível copiar o IP.', true);
  });
}

// Gerenciador de Abas do Form de Autenticação (Entrar / Cadastrar)
function toggleAuthTab(tab) {
  const loginForm = document.getElementById('auth-login-form');
  const registerForm = document.getElementById('auth-register-form');
  const loginBtn = document.getElementById('auth-tab-login');
  const registerBtn = document.getElementById('auth-tab-register');

  if (tab === 'login') {
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    loginBtn.classList.add('active');
    registerBtn.classList.remove('active');
  } else {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    loginBtn.classList.remove('active');
    registerBtn.classList.add('active');
  }
}

// Inicializar comportamento dos acordeões de regras
function initAccordions() {
  document.querySelectorAll('.accordion-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const parent = trigger.parentElement;
      const wasActive = parent.classList.contains('active');
      
      // Fechar todos
      document.querySelectorAll('.accordion-item').forEach(item => {
        item.classList.remove('active');
      });

      // Abrir o clicado se não estava ativo
      if (!wasActive) {
        parent.classList.add('active');
      }
    });
  });
}

// Verificar sessão ativa e atualizar UI
async function verifySession() {
  if (!currentToken) {
    updateAuthUI(null);
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    
    const data = await res.json();
    if (res.ok) {
      currentUser = data.user;
      updateAuthUI(currentUser);
    } else {
      // Token expirado ou inválido
      handleLogout();
    }
  } catch (err) {
    console.error('Erro ao verificar sessão:', err.message);
    updateAuthUI(null);
  }
}

// Atualizar botões de autenticação na UI
function updateAuthUI(user) {
  const loginBtn = document.getElementById('nav-login-btn');
  const userBadge = document.getElementById('nav-user-badge');
  const adminBtn = document.getElementById('nav-admin-btn');
  const badgeUsername = document.getElementById('badge-username');
  const badgeCoins = document.getElementById('badge-coins');

  if (user) {
    loginBtn.style.display = 'none';
    userBadge.style.display = 'flex';
    badgeUsername.textContent = user.username;
    badgeCoins.textContent = user.coins_balance || 0;
    
    // Mostrar botão de Admin se for administrador
    if (user.role === 'admin') {
      adminBtn.style.display = 'inline-flex';
    } else {
      adminBtn.style.display = 'none';
    }
  } else {
    loginBtn.style.display = 'inline-flex';
    userBadge.style.display = 'none';
    adminBtn.style.display = 'none';
  }
}

// EFETUAR LOGIN (AJAX)
async function handleLogin(event) {
  event.preventDefault();
  const usernameInput = document.getElementById('login-username').value;
  const passwordInput = document.getElementById('login-password').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameInput, password: passwordInput })
    });

    const data = await res.json();
    if (res.ok) {
      localStorage.setItem('token', data.token);
      currentToken = data.token;
      currentUser = data.user;
      
      updateAuthUI(currentUser);
      showToast(`Bem-vindo de volta, ${currentUser.username}!`);
      
      // Limpar formulário e ir para Home ou Perfil
      document.getElementById('auth-login-form').reset();
      switchView('home');
    } else {
      showToast(data.error || 'Falha ao efetuar login.', true);
    }
  } catch (err) {
    showToast('Erro de conexão ao tentar fazer login.', true);
  }
}

// REGISTRAR NOVO USUÁRIO (AJAX)
async function handleRegister(event) {
  event.preventDefault();
  const username = document.getElementById('reg-username').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;
  const charName = document.getElementById('reg-char-name').value;
  const tribeName = document.getElementById('reg-tribe-name').value;

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        email,
        password,
        character_name: charName,
        tribe_name: tribeName
      })
    });

    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'Cadastro realizado! Ative sua conta no e-mail.', false);
      document.getElementById('auth-register-form').reset();
      toggleAuthTab('login');
    } else {
      showToast(data.error || 'Falha ao cadastrar.', true);
    }
  } catch (err) {
    showToast('Erro de conexão ao tentar registrar.', true);
  }
}

// LOGOUT
function handleLogout() {
  localStorage.removeItem('token');
  currentToken = null;
  currentUser = null;
  updateAuthUI(null);
  switchView('home');
  showToast('Logout efetuado com sucesso.');
}

// CARREGAR DADOS DO PERFIL DO USUÁRIO
function loadProfileData() {
  if (!currentUser) return;
  
  document.getElementById('prof-username').textContent = currentUser.username;
  document.getElementById('prof-email').textContent = currentUser.email;
  document.getElementById('prof-coins').textContent = currentUser.coins_balance || 0;
  document.getElementById('prof-level').textContent = currentUser.character_level || 1;
  document.getElementById('prof-kills').textContent = currentUser.kills || 0;
  document.getElementById('prof-playtime').textContent = (currentUser.playtime_hours || 0) + 'h';
  document.getElementById('prof-ark-id').value = currentUser.ark_id || '';

  // Renderizar box VIP
  const vipBox = document.getElementById('prof-vip-box');
  const vipStatusSpan = document.getElementById('prof-vip-status');
  const vipExpirySpan = document.getElementById('prof-vip-expiry');

  if (vipBox && vipStatusSpan && vipExpirySpan) {
    if (currentUser.vip_status && currentUser.vip_status !== 'Membro') {
      vipStatusSpan.textContent = currentUser.vip_status;
      
      if (currentUser.vip_expires_at) {
        const expiryDate = new Date(currentUser.vip_expires_at);
        const formattedDate = expiryDate.toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        vipExpirySpan.textContent = `Expira em: ${formattedDate}`;
      } else {
        vipExpirySpan.textContent = 'Expiração: Vitalício';
      }
      vipBox.style.display = 'block';
    } else {
      vipBox.style.display = 'none';
    }
  }
}

// SALVAR ID ARK NO PERFIL DO USUÁRIO (VALIDA DUPLICIDADE NO BACKEND)
async function saveArkId() {
  const arkIdInput = document.getElementById('prof-ark-id').value;

  try {
    const res = await fetch('/api/auth/profile/ark-id', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ ark_id: arkIdInput })
    });

    const data = await res.json();
    if (res.ok) {
      currentUser.ark_id = data.ark_id;
      showToast(data.message || 'ID ARK atualizado com sucesso!');
      verifySession(); // Recarrega os dados atualizados da sessão
    } else {
      showToast(data.error || 'Erro ao atualizar ID ARK.', true);
    }
  } catch (err) {
    showToast('Erro de conexão ao atualizar ID ARK.', true);
  }
}

// ALTERAR SENHA DO USUÁRIO LOGADO
async function changePassword(event) {
  event.preventDefault();
  const currentPassword = document.getElementById('prof-curr-pass').value;
  const newPassword = document.getElementById('prof-new-pass').value;

  try {
    const res = await fetch('/api/auth/profile/password', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ currentPassword, newPassword })
    });

    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'Senha alterada com sucesso!');
      document.getElementById('prof-password-form').reset();
    } else {
      showToast(data.error || 'Erro ao alterar a senha.', true);
    }
  } catch (err) {
    showToast('Erro de conexão ao alterar a senha.', true);
  }
}

// ESQUECI A SENHA
function openForgotPasswordModal() {
  document.getElementById('forgot-password-modal').classList.add('open');
}

async function handleForgotPassword(event) {
  event.preventDefault();
  const emailVal = document.getElementById('forgot-email-input').value;

  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailVal })
    });

    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'Instruções enviadas para seu e-mail!');
      closeModal('forgot-password-modal');
      document.getElementById('forgot-email-input').value = '';
    } else {
      showToast(data.error || 'Erro ao enviar redefinição.', true);
    }
  } catch (err) {
    showToast('Erro de conexão.', true);
  }
}

// REDEFINIR SENHA
async function handleResetPassword(event) {
  event.preventDefault();
  const token = document.getElementById('reset-token-input').value;
  const newPassword = document.getElementById('reset-pass-input').value;

  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password: newPassword })
    });

    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'Senha redefinida com sucesso! Faça login.');
      closeModal('reset-password-modal');
      switchView('auth');
      toggleAuthTab('login');
    } else {
      showToast(data.error || 'Erro ao redefinir a senha.', true);
    }
  } catch (err) {
    showToast('Erro de conexão.', true);
  }
}

// GERENCIAR QUERY PARAMS DA URL
function handleUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  
  // Se veio redirecionado com e-mail verificado
  if (urlParams.has('verified')) {
    showToast('Parabéns! Seu e-mail foi verificado e sua conta está ativa.');
    // Limpar parâmetros da URL de forma elegante
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // Se veio com token de reset de senha
  if (urlParams.has('reset_token')) {
    const token = urlParams.get('reset_token');
    document.getElementById('reset-token-input').value = token;
    document.getElementById('reset-password-modal').classList.add('open');
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// CARREGAR PROMOÇÕES EM DESTAQUE NA PRIMEIRA ABA (HOME)
async function loadHomePromotions() {
  const promoGrid = document.getElementById('home-promotions-list');
  if (!promoGrid) return;

  try {
    // Buscar todos os produtos e destacar os da categoria VIP ou com preços competitivos
    const res = await fetch('/api/products');
    const data = await res.json();

    if (res.ok && data.products) {
      // Renderizar o Produto Principal em Destaque
      renderFeaturedProduct(data.products);

      // Filtrar produtos de destaque (ex: VIPs ou Kits com mais desconto)
      const featured = data.products.slice(0, 2); // Pega os 2 primeiros itens para o painel de ofertas
      
      if (featured.length === 0) {
        promoGrid.innerHTML = '<div style="grid-column: span 2; text-align: center; color: var(--muted);">Sem promoções ativas no momento.</div>';
        return;
      }

      promoGrid.innerHTML = '';
      featured.forEach(prod => {
        const defaultVar = prod.variations ? prod.variations[0] : null;
        const priceVal = defaultVar ? parseFloat(defaultVar.price) : 0.00;
        const fakeOldPrice = (priceVal * 1.5).toFixed(2);
        const iconClass = getCategoryIcon(prod.category);
        
        const promoItem = document.createElement('div');
        promoItem.className = 'promo-item';
        promoItem.onclick = () => {
          switchView('store');
          if (typeof filterCategory === 'function') filterCategory(prod.category);
        };

        promoItem.innerHTML = `
          <div class="promo-badge">OFERTA</div>
          <div class="promo-img">
            <i class="${iconClass}"></i>
          </div>
          <div class="promo-details">
            <h4>${prod.name}</h4>
            <p>${prod.description ? prod.description.substring(0, 50) + '...' : ''}</p>
            <div class="promo-prices">
              <span class="old-price">R$ ${fakeOldPrice}</span>
              <span class="new-price">R$ ${priceVal.toFixed(2)}</span>
            </div>
          </div>
        `;
        promoGrid.appendChild(promoItem);
      });
    }
  } catch (err) {
    console.error('Erro ao carregar promoções da Home:', err.message);
  }
}

// AUXILIAR: ÍCONES POR CATEGORIA
function getCategoryIcon(category) {
  const catLower = category ? category.toLowerCase() : '';
  if (catLower.includes('vip')) return 'fa-solid fa-crown';
  if (catLower.includes('coin') || catLower.includes('moeda')) return 'fa-solid fa-coins';
  if (catLower.includes('kit')) return 'fa-solid fa-box-open';
  if (catLower.includes('dino') || catLower.includes('criatura')) return 'fa-solid fa-dragon';
  if (catLower.includes('item') || catLower.includes('recurso') || catLower.includes('tek')) return 'fa-solid fa-cubes';
  if (catLower.includes('xp') || catLower.includes('booster')) return 'fa-solid fa-bolt';
  return 'fa-solid fa-box';
}

// RENDERIZAR PRODUTO EM DESTAQUE NA HOME
function renderFeaturedProduct(products) {
  const featuredContainer = document.getElementById('home-featured-product');
  if (!featuredContainer) return;

  // Encontrar o plano VIP Ouro ou o produto mais caro/relevante
  let featuredProd = products.find(p => p.category.toLowerCase().includes('vip') && p.name.includes('Ouro'));
  if (!featuredProd) {
    featuredProd = products.find(p => p.category.toLowerCase().includes('vip'));
  }
  if (!featuredProd) {
    featuredProd = products.find(p => p.name.toLowerCase().includes('giganotosaurus'));
  }
  if (!featuredProd) {
    featuredProd = products[0]; // Fallback
  }

  if (!featuredProd) {
    featuredContainer.style.display = 'none';
    return;
  }

  const defaultVar = featuredProd.variations ? featuredProd.variations[0] : null;
  const priceVal = defaultVar ? parseFloat(defaultVar.price) : 0.00;
  const fakeOldPrice = (priceVal * 1.4).toFixed(2);
  const iconClass = getCategoryIcon(featuredProd.category);

  // Perks específicos baseados no produto para dar um visual premium
  let perksHtml = '';
  if (featuredProd.category.toLowerCase().includes('vip')) {
    perksHtml = `
      <div class="featured-perk-item"><i class="fa-solid fa-gem"></i> 50% de Desconto na Loja</div>
      <div class="featured-perk-item"><i class="fa-solid fa-tag"></i> Tag Especial In-Game</div>
      <div class="featured-perk-item"><i class="fa-solid fa-circle-chevron-up"></i> Acesso Prioritário (Fila)</div>
      <div class="featured-perk-item"><i class="fa-solid fa-gift"></i> Kit Especial Mensal</div>
    `;
  } else if (featuredProd.category.toLowerCase().includes('dino')) {
    perksHtml = `
      <div class="featured-perk-item"><i class="fa-solid fa-dna"></i> Level 225 Garantido</div>
      <div class="featured-perk-item"><i class="fa-solid fa-shield-cat"></i> Versão Macho ou Fêmea</div>
      <div class="featured-perk-item"><i class="fa-solid fa-truck-ramp-box"></i> Entrega Rápida RCON</div>
      <div class="featured-perk-item"><i class="fa-solid fa-heart"></i> Pronto para Acasalamento</div>
    `;
  } else {
    perksHtml = `
      <div class="featured-perk-item"><i class="fa-solid fa-check"></i> Entrega Automática</div>
      <div class="featured-perk-item"><i class="fa-solid fa-bolt"></i> Suporte 24h</div>
      <div class="featured-perk-item"><i class="fa-solid fa-shield"></i> Seguro Antiperda</div>
      <div class="featured-perk-item"><i class="fa-solid fa-star"></i> Item Selecionado</div>
    `;
  }

  const mediaHtml = featuredProd.imagem_url
    ? `<img src="${featuredProd.imagem_url}" style="width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 0 20px rgba(0,255,196,0.35));" alt="${featuredProd.name}">`
    : `<i class="${iconClass}"></i>`;

  featuredContainer.innerHTML = `
    <div class="featured-badge">Melhor Oferta</div>
    <div class="featured-img-box">
      ${mediaHtml}
    </div>
    <div class="featured-info">
      <span class="featured-category">${featuredProd.category}</span>
      <h2 class="featured-title">${featuredProd.name}</h2>
      <p class="featured-description">${featuredProd.description || 'Aproveite esta oferta especial por tempo limitado no servidor.'}</p>
      <div class="featured-perks">
        ${perksHtml}
      </div>
      <div class="featured-action-block">
        <div class="featured-price-box">
          <span class="featured-old-price">R$ ${fakeOldPrice}</span>
          <span class="featured-new-price">R$ ${priceVal.toFixed(2)}</span>
        </div>
        <button class="btn btn-primary btn-large" id="featured-buy-btn" style="padding: 12px 25px;">
          <i class="fa-solid fa-cart-plus"></i> Adquirir Agora
        </button>
      </div>
    </div>
  `;

  // Configurar clique do botão de compra para adicionar a variação padrão ao carrinho
  const buyBtn = featuredContainer.querySelector('#featured-buy-btn');
  if (buyBtn && defaultVar) {
    buyBtn.onclick = (e) => {
      e.stopPropagation();
      addToCart(defaultVar.id, featuredProd.name, defaultVar.name, priceVal);
    };
  }

  featuredContainer.style.display = 'flex';
}
