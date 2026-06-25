// Funções auxiliares para Cookies
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    try {
      return decodeURIComponent(parts.pop().split(';').shift());
    } catch (_) {
      return null;
    }
  }
  return null;
}

function setCookie(name, value, days = 30) {
  const d = new Date();
  d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
  const expires = "expires=" + d.toUTCString();
  document.cookie = name + "=" + encodeURIComponent(value) + ";" + expires + ";path=/";
}

// Estado do Carrinho (Persiste no Cookie e LocalStorage)
let cart = [];
try {
  const cartCookie = getCookie('cart');
  if (cartCookie) {
    cart = JSON.parse(cartCookie) || [];
  } else {
    cart = JSON.parse(localStorage.getItem('cart')) || [];
  }
} catch (_) {
  cart = [];
}
let activeCategory = 'all';

// Aguarda o DOM estar pronto para desenhar o carrinho carregado
document.addEventListener('DOMContentLoaded', () => {
  renderCart();
});

// 1. CARREGAR CATALOGO DE PRODUTOS
async function loadCatalog() {
  const grid = document.getElementById('store-products-grid');
  const countEl = document.getElementById('store-items-count');
  if (!grid) return;

  grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--muted);"><i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary);"></i><p style="margin-top: 10px;">Carregando produtos...</p></div>';

  try {
    const url = activeCategory === 'all' ? '/api/products' : `/api/products?category=${activeCategory}`;
    const res = await fetch(url);
    const data = await res.json();

    if (res.ok && data.products) {
      // Guardar catálogo globalmente para buscas rápidas de variações
      window.catalogProducts = data.products;
      countEl.textContent = `${data.products.length} produtos encontrados`;
      
      if (data.products.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--muted);">Sem produtos ativos nesta categoria no momento.</div>';
        return;
      }
      grid.innerHTML = '';
      data.products.forEach(prod => {
        const iconClass = getCategoryIcon(prod.category);
        const card = document.createElement('div');
        card.className = 'product-card';
        
        // Variação padrão inicial (a primeira)
        const defaultVar = prod.variations[0];
        const limitText = defaultVar.purchase_limit > 0 
          ? `Limite: ${defaultVar.purchase_limit} por sobrevivente` 
          : 'Sem limite de compra';

        // Seletor de variações se houver mais de uma
        let selectHtml = '';
        let buyActionHtml = '';

        if (prod.variations.length === 1) {
          // Apenas uma variação, compra direta
          selectHtml = `<div style="font-size: 0.8rem; color: var(--muted); margin-bottom: 12px; font-weight: 500;">Opção: ${defaultVar.nome || defaultVar.name}</div>`;
          buyActionHtml = `
            <button class="product-buy-btn" onclick="addToCart(${defaultVar.id}, '${(defaultVar.nome || defaultVar.name).replace(/'/g, "\\'")}', ${defaultVar.price}, ${defaultVar.purchase_limit})">
              <i class="fa-solid fa-cart-plus"></i> Comprar
            </button>
          `;
        } else {
          // Múltiplas variações, renderiza menu dropdown
          selectHtml = `
            <div style="margin-bottom: 12px;">
              <label style="font-size: 0.7rem; color: var(--muted); text-transform: uppercase; display: block; margin-bottom: 4px;">Selecione o Pacote:</label>
              <select id="select-${prod.id}" class="form-control" style="padding: 6px 10px; font-size: 0.8rem; background: rgba(6,7,9,0.8); border: 1px solid var(--border-light); color: var(--text-light); border-radius: 4px; width: 100%; cursor: pointer;" onchange="changeProductVariation(this, ${prod.id})">
                ${prod.variations.map(v => `<option value="${v.id}">${v.nome || v.name} - R$ ${parseFloat(v.price).toFixed(2)}</option>`).join('')}
              </select>
            </div>
          `;
          buyActionHtml = `
            <button class="product-buy-btn" onclick="buySelectedVariation(${prod.id})">
              <i class="fa-solid fa-cart-plus"></i> Comprar
            </button>
          `;
        }

        const cardMediaHtml = prod.imagem_url 
          ? `<img src="${prod.imagem_url}" style="width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 0 10px rgba(0,255,196,0.2));" alt="${prod.name}">`
          : `<i class="${iconClass}"></i>`;

        card.innerHTML = `
          <div class="product-badge">${prod.category}</div>
          <div class="product-img-box" style="cursor: pointer;" onclick="openProductDetail(${prod.id})">
            ${cardMediaHtml}
          </div>
          <div class="product-info">
            <h3 class="product-name" style="cursor: pointer;" onclick="openProductDetail(${prod.id})">${prod.name}</h3>
            <p class="product-desc" style="margin-bottom: 10px;">${prod.description || 'Nenhuma descrição fornecida.'}</p>
            ${selectHtml}
            <div class="product-limit" id="limit-${prod.id}"><i class="fa-solid fa-circle-exclamation"></i> ${limitText}</div>
            <div class="product-footer">
              <span class="product-price" id="price-${prod.id}">${renderPriceHTML(defaultVar)}</span>
              ${buyActionHtml}
            </div>
          </div>
        `;
        grid.appendChild(card);
      });
    } else {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--danger);">Erro ao renderizar catálogo.</div>';
    }
  } catch (err) {
    console.error(err);
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--danger);">Falha de conexão com o servidor.</div>';
  }
}

// CALCULAR PREÇO DA VARIAÇÃO CONSIDERANDO DESCONTO VIP
function getVariationPrice(variation) {
  const vipDiscount = (currentUser && currentUser.vip_discount_percent) || 0;
  let finalPrice = parseFloat(variation.price);
  if (vipDiscount > 0 && variation.allow_discount) {
    finalPrice = parseFloat((finalPrice * (100 - vipDiscount) / 100).toFixed(2));
  }
  return finalPrice;
}

// RENDERIZAR HTML DO PREÇO DA VARIAÇÃO (COM DESCONTO SE APLICÁVEL)
function renderPriceHTML(variation) {
  const originalPrice = parseFloat(variation.price);
  const finalPrice = getVariationPrice(variation);
  
  if (finalPrice < originalPrice) {
    return `
      <span style="text-decoration: line-through; color: var(--muted); font-size: 0.85rem; margin-right: 8px;">R$ ${originalPrice.toFixed(2)}</span>
      <span style="color: var(--primary); font-weight: 700;">R$ ${finalPrice.toFixed(2)}</span>
    `;
  } else {
    return `<span style="color: var(--text-light); font-weight: 700;">R$ ${originalPrice.toFixed(2)}</span>`;
  }
}

// MUDAR PREÇO E LIMITES CONFORME VARIAÇÃO SELECIONADA
function changeProductVariation(selectEl, productId) {
  const varId = parseInt(selectEl.value, 10);
  const prod = window.catalogProducts.find(p => p.id === productId);
  if (!prod) return;

  const variation = prod.variations.find(v => v.id === varId);
  if (!variation) return;

  // Atualizar Preço exibido
  document.getElementById(`price-${productId}`).innerHTML = renderPriceHTML(variation);

  // Atualizar texto de limite
  const limitText = variation.purchase_limit > 0 
    ? `Limite: ${variation.purchase_limit} por sobrevivente` 
    : 'Sem limite de compra';
  document.getElementById(`limit-${productId}`).innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${limitText}`;
}

// COMPRAR VARIAÇÃO SELECIONADA NO DROPDOWN
function buySelectedVariation(productId) {
  const select = document.getElementById(`select-${productId}`);
  if (!select) return;
  
  const varId = parseInt(select.value, 10);
  const prod = window.catalogProducts.find(p => p.id === productId);
  if (!prod) return;

  const variation = prod.variations.find(v => v.id === varId);
  if (!variation) return;

  addToCart(variation.id, variation.nome || variation.name, parseFloat(variation.price), variation.purchase_limit);
}

// 2. FILTRAR POR CATEGORIA
function filterCategory(category) {
  activeCategory = category;
  
  document.querySelectorAll('.filter-btn').forEach(btn => {
    if (btn.getAttribute('data-category') === category) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const titles = {
    all: 'Todos os Produtos',
    vip: 'Planos VIP e Assinaturas',
    coins: 'Moedas de Ouro',
    kits: 'Kits Especiais',
    dinos: 'Criaturas & Dinossauros',
    'Dinos PvP': 'Dinos PvP de Combate',
    Boss: 'Dinos Especiais para Bosses',
    'Tank / Soak': 'Dinos Tanks para Soak',
    Raid: 'Dinos de Raid e Destruição',
    Farm: 'Dinos de Coleta / Farm',
    'Farm / Transporte': 'Dinos de Transporte',
    'Mobilidade PvP': 'Dinos de Mobilidade e PvP',
    'PvP Premium': 'Dinos PvP Premium',
    'Criação / Mobilidade': 'Dinos de Criação',
    Recursos: 'Recursos Básicos e Avançados',
    Tek: 'Tecnologia TEK'
  };
  
  document.getElementById('store-category-title').textContent = titles[category] || 'Produtos';
  loadCatalog();
}

// 3. ABRIR / FECHAR GAVETA DO CARRINHO
function toggleCart() {
  const cartDrawer = document.getElementById('cart-drawer');
  cartDrawer.classList.toggle('open');
}

// 4. ADICIONAR ITEM AO CARRINHO (Por variationId)
function addToCart(variationId, name, price, limit) {
  const existingIndex = cart.findIndex(item => item.variationId === variationId);
  
  // Buscar se permite desconto no catálogo local
  let allowDiscount = true;
  if (window.catalogProducts) {
    for (const p of window.catalogProducts) {
      const v = p.variations.find(varItem => varItem.id === variationId);
      if (v) {
        allowDiscount = v.allow_discount !== false;
        break;
      }
    }
  }

  if (existingIndex > -1) {
    if (limit > 0 && cart[existingIndex].quantity >= limit) {
      showToast(`Você já atingiu o limite permitido (${limit}) deste item no carrinho.`, true);
      return;
    }
    cart[existingIndex].quantity += 1;
  } else {
    cart.push({ variationId, name, price, limit, allowDiscount, quantity: 1 });
  }

  showToast(`"${name}" adicionado ao carrinho!`);
  renderCart();
  
  const cartDrawer = document.getElementById('cart-drawer');
  if (cartDrawer && !cartDrawer.classList.contains('open')) {
    cartDrawer.classList.add('open');
  }
}

// 5. RENDERIZAR CARRINHO
function renderCart() {
  const container = document.getElementById('cart-items-container');
  const countBadge = document.getElementById('cart-count');
  const totalVal = document.getElementById('cart-total-value');
  
  if (!container) return;

  if (cart.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: var(--muted); padding: 40px 0;"><i class="fa-solid fa-basket-shopping" style="font-size: 2.5rem; display:block; margin-bottom:10px;"></i>Seu carrinho está vazio.</div>';
    countBadge.textContent = '0';
    totalVal.textContent = 'R$ 0,00';
    return;
  }

  const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  countBadge.textContent = totalCount;

  container.innerHTML = '';
  let subtotal = 0;

  cart.forEach((item, index) => {
    // Calcular preço final aplicando desconto se logado e elegível
    const vipDiscount = (currentUser && currentUser.vip_discount_percent) || 0;
    let finalPrice = item.price;
    if (vipDiscount > 0 && item.allowDiscount) {
      finalPrice = parseFloat((finalPrice * (100 - vipDiscount) / 100).toFixed(2));
    }

    const itemTotal = finalPrice * item.quantity;
    subtotal += itemTotal;

    const row = document.createElement('div');
    row.className = 'cart-item';
    row.innerHTML = `
      <div class="cart-item-remove" onclick="removeFromCart(${index})"><i class="fa-solid fa-trash-can"></i></div>
      <div class="cart-item-info">
        <h4>${item.name}</h4>
        <div class="cart-item-price">
          ${finalPrice < item.price ? `<span style="text-decoration: line-through; opacity: 0.5; font-size: 0.8rem; margin-right: 6px;">R$ ${item.price.toFixed(2)}</span>` : ''}
          R$ ${finalPrice.toFixed(2)}
        </div>
        <div style="display:flex; align-items:center; gap: 8px; margin-top: 5px;">
          <button style="background:rgba(255,255,255,0.05); border:1px solid var(--border-light); color:var(--text-light); width:20px; height:20px; border-radius:3px; cursor:pointer;" onclick="updateCartQty(${index}, ${item.quantity - 1})">-</button>
          <span style="font-size:0.85rem; font-weight:600;">${item.quantity}</span>
          <button style="background:rgba(255,255,255,0.05); border:1px solid var(--border-light); color:var(--text-light); width:20px; height:20px; border-radius:3px; cursor:pointer;" onclick="updateCartQty(${index}, ${item.quantity + 1})">+</button>
        </div>
      </div>
    `;
    container.appendChild(row);
  });

  totalVal.textContent = `R$ ${subtotal.toFixed(2)}`;
  localStorage.setItem('cart', JSON.stringify(cart));
  setCookie('cart', JSON.stringify(cart), 30);
}

// Atualizar quantidade
function updateCartQty(index, newQty) {
  if (newQty <= 0) {
    removeFromCart(index);
    return;
  }
  
  const item = cart[index];
  if (item.limit > 0 && newQty > item.limit) {
    showToast(`O limite máximo permitido deste produto é ${item.limit}.`, true);
    return;
  }

  cart[index].quantity = newQty;
  renderCart();
}

// Remover do carrinho
function removeFromCart(index) {
  cart.splice(index, 1);
  renderCart();
  localStorage.setItem('cart', JSON.stringify(cart));
  setCookie('cart', JSON.stringify(cart), 30);
}

// Habilitar input de ID para presentes no carrinho
function toggleGiftingInput(isGift) {
  const giftContainer = document.getElementById('cart-gift-input-container');
  giftContainer.style.display = isGift ? 'block' : 'none';
}

// 6. FINALIZAR COMPRA (CHECKOUT)
async function checkoutCart() {
  if (!currentUser) {
    switchView('auth');
    showToast('Você precisa estar logado para efetuar compras.', true);
    return;
  }

  if (cart.length === 0) {
    showToast('Seu carrinho está vazio.', true);
    return;
  }



  const isGift = document.getElementById('cart-is-gift').checked;
  const recipientArkId = document.getElementById('cart-gift-ark-id').value;

  if (!isGift && !currentUser.ark_id) {
    switchView('profile');
    showToast('Por favor, cadastre seu ID ARK no perfil antes de fazer o checkout.', true);
    return;
  }

  if (isGift && (!recipientArkId || recipientArkId.trim() === '')) {
    showToast('Preencha o ID ARK do sobrevivente que receberá o presente.', true);
    return;
  }

  // Mapear itens para usar o variationId
  const checkoutItems = cart.map(item => ({
    variationId: item.variationId,
    quantity: item.quantity
  }));

  try {
    const res = await fetch('/api/orders/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({
        items: checkoutItems,
        is_gift: isGift,
        recipient_ark_id: isGift ? recipientArkId : currentUser.ark_id
      })
    });

    const data = await res.json();
    if (res.ok) {
      document.getElementById('checkout-modal').classList.add('open');
      toggleCart();

      // Buscar a Chave Pública nas configurações (endpoint público)
      const configRes = await fetch('/api/products/config/public-key');
      const configData = await configRes.json().catch(() => ({}));
      const publicKey = (configRes.ok && configData.publicKey) || '';

      const container = document.getElementById('paymentBrick_container');
      container.innerHTML = `
        <div style="margin-bottom: 15px; padding: 12px; background: rgba(0, 255, 196, 0.05); border: 1px solid rgba(0, 255, 196, 0.2); border-radius: 6px; font-size: 0.85rem; color: var(--text-light); text-align: left; line-height: 1.4;">
          <i class="fa-solid fa-circle-info" style="color: var(--primary); margin-right: 6px;"></i>
          <strong>Como pagar:</strong> Preencha o e-mail abaixo e clique no botão <strong>Pagar</strong> no final da página para gerar o <strong>QR Code do Pix</strong> e a chave copia e cola na tela imediatamente.
        </div>
        <div id="paymentBrick_actual_container"></div>
      `;

      // Se houver Chave Pública válida e o SDK estiver carregado, inicia o Brick
      if (publicKey && !publicKey.includes('mock') && typeof window.MercadoPago !== 'undefined') {
        const mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' });
        const bricksBuilder = mp.bricks();
        
        const renderPaymentBrick = async (builders) => {
          const settings = {
            initialization: {
              amount: parseFloat(data.totalAmount.toFixed(2)),
            },
            customization: {
              paymentMethods: {
                ticket: 'all',
                bankTransfer: ['pix'],
                creditCard: 'all',
                debitCard: 'all',
                mercadoPago: 'all',
              },
            },
            callbacks: {
              onReady: () => {
                console.log('Payment Brick is ready');
              },
              onSubmit: async ({ selectedPaymentMethod, formData }) => {
                try {
                  const submitRes = await fetch('/api/orders/process-payment', {
                    method: 'POST',
                    headers: { 
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${currentToken}`
                    },
                    body: JSON.stringify({
                      orderId: data.orderId,
                      paymentData: formData
                    })
                  });
                  const paymentResult = await submitRes.json();
                  if (submitRes.ok) {
                    // Limpar carrinho e cookie, pois a venda foi processada/gerada
                    cart = [];
                    renderCart();
                    localStorage.removeItem('cart');
                    setCookie('cart', '', -1);

                    if (paymentResult.status === 'approved') {
                      container.innerHTML = `
                        <div class="payment-result-box" style="padding: 20px; text-align: center;">
                          <i class="fa-solid fa-circle-check" style="font-size: 3.5rem; color: var(--primary); margin-bottom: 15px;"></i>
                          <h4 style="margin-bottom: 10px; color: var(--text-light);">Pagamento Aprovado!</h4>
                          <p style="font-size: 0.9rem; color: var(--text-dim); margin-bottom: 20px;">Sua compra foi concluída com sucesso e seus itens estão sendo entregues no jogo via RCON.</p>
                          <button class="btn btn-primary" onclick="closeModal('checkout-modal'); switchView('profile');" style="width: 100%;">Ver Meus Pedidos</button>
                        </div>
                      `;
                      showToast('Pagamento aprovado via Checkout Transparente!');
                    } else if (paymentResult.status === 'pending' || paymentResult.status === 'in_process') {
                      if (formData.payment_method_id === 'pix' && (paymentResult.qr_code || paymentResult.qr_code_base64)) {
                        const qrCodeSrc = paymentResult.qr_code_base64 
                          ? `data:image/jpeg;base64,${paymentResult.qr_code_base64}`
                          : `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(paymentResult.qr_code)}`;
                          
                        container.innerHTML = `
                          <div class="payment-result-box" style="padding: 20px; text-align: center;">
                            <i class="fa-solid fa-qrcode" style="font-size: 3.5rem; color: var(--primary); margin-bottom: 15px;"></i>
                            <h4 style="margin-bottom: 10px; color: var(--text-light);">Pedido de Pix Gerado!</h4>
                            <p style="font-size: 0.9rem; color: var(--text-dim); margin-bottom: 15px;">Escaneie o QR Code abaixo ou copie a chave Pix para pagar:</p>
                            
                            <div style="background: white; padding: 10px; display: inline-block; border-radius: 8px; margin-bottom: 15px;">
                              <img src="${qrCodeSrc}" alt="QR Code Pix" style="width: 200px; height: 200px; display: block;">
                            </div>
                            
                            <div class="form-group" style="margin-bottom: 15px;">
                              <input type="text" id="pix-copy-input" class="form-control" value="${paymentResult.qr_code}" readonly style="text-align: center; font-family: monospace; font-size: 0.8rem; background: rgba(0,0,0,0.3); border: 1px solid var(--border-light); color: var(--text-light); padding: 8px;">
                            </div>
                            
                            <button class="btn btn-primary" onclick="copyPixKey()" style="width: 100%; margin-bottom: 10px;">
                              <i class="fa-regular fa-copy"></i> Copiar Código Pix
                            </button>
                          </div>
                        `;
                        showToast('Pedido Pix gerado com sucesso!');
                      } else if (paymentResult.ticket_url) {
                        container.innerHTML = `
                          <div class="payment-result-box" style="padding: 20px; text-align: center;">
                            <i class="fa-solid fa-barcode" style="font-size: 3.5rem; color: var(--primary); margin-bottom: 15px;"></i>
                            <h4 style="margin-bottom: 10px; color: var(--text-light);">Boleto Gerado com Sucesso!</h4>
                            <p style="font-size: 0.9rem; color: var(--text-dim); margin-bottom: 20px;">Clique no botão abaixo para abrir ou imprimir o seu boleto bancário:</p>
                            
                            <a href="${paymentResult.ticket_url}" target="_blank" class="btn btn-primary" style="display: block; text-decoration: none; margin-bottom: 10px; text-align: center; line-height: 20px;">
                              <i class="fa-solid fa-print"></i> Abrir Boleto Bancário
                            </a>
                          </div>
                        `;
                        showToast('Boleto gerado com sucesso!');
                      } else {
                        container.innerHTML = `
                          <div class="payment-result-box" style="padding: 20px; text-align: center;">
                            <i class="fa-solid fa-circle-info" style="font-size: 3.5rem; color: var(--secondary); margin-bottom: 15px;"></i>
                            <h4 style="margin-bottom: 10px; color: var(--text-light);">Pagamento em Processamento</h4>
                            <p style="font-size: 0.9rem; color: var(--text-dim); margin-bottom: 20px;">Seu pagamento está sendo analisado pelo Mercado Pago. Assim que for aprovado, os itens serão entregues no jogo.</p>
                            <button class="btn btn-primary" onclick="closeModal('checkout-modal'); switchView('profile');" style="width: 100%;">Ver Meus Pedidos</button>
                          </div>
                        `;
                        showToast('Pagamento em processamento.');
                      }
                    } else {
                      container.innerHTML = `
                        <div class="payment-result-box" style="padding: 20px; text-align: center;">
                          <i class="fa-solid fa-circle-xmark" style="font-size: 3.5rem; color: var(--danger); margin-bottom: 15px;"></i>
                          <h4 style="margin-bottom: 10px; color: var(--text-light);">Pagamento Recusado</h4>
                          <p style="font-size: 0.9rem; color: var(--text-dim); margin-bottom: 20px;">Motivo: ${paymentResult.error || 'A transação foi recusada pelo provedor.'}</p>
                          <button class="btn btn-secondary" onclick="closeModal('checkout-modal')" style="width: 100%;">Tentar Novamente</button>
                        </div>
                      `;
                      showToast(paymentResult.error || 'Pagamento recusado.', true);
                    }
                  } else {
                    showToast(paymentResult.error || 'Erro ao processar pagamento.', true);
                  }
                } catch (err) {
                  showToast('Erro de conexão com o servidor.', true);
                }
              },
              onError: (error) => {
                console.error(error);
                showToast('Erro no formulário de pagamento.', true);
              },
            },
          };
          window.paymentBrickController = await builders.create(
            'payment',
            'paymentBrick_actual_container',
            settings
          );
        };
        renderPaymentBrick(bricksBuilder);
      } else {
        container.innerHTML = `
          <div style="padding: 30px; text-align: center; color: var(--danger);">
            <i class="fa-solid fa-circle-exclamation" style="font-size: 2.5rem; margin-bottom: 15px;"></i>
            <p style="font-size: 0.95rem; font-weight: 600;">Chave Pública do Mercado Pago não configurada!</p>
            <p style="font-size: 0.8rem; color: var(--muted); margin-top: 5px;">Acesse o painel administrativo para salvar suas chaves de produção.</p>
          </div>
        `;
      }
    } else {
      showToast(data.error || 'Erro ao processar checkout.', true);
    }
  } catch (err) {
    showToast('Erro de conexão ao processar o checkout.', true);
  }
}

// Chave Pix Copia e Cola
function copyPixKey() {
  const copyText = document.getElementById('pix-copy-input');
  copyText.select();
  copyText.setSelectionRange(0, 99999);
  navigator.clipboard.writeText(copyText.value).then(() => {
    showToast('Código Pix copiado!');
  }).catch(() => {
    showToast('Falha ao copiar código.', true);
  });
}

// 8. HISTÓRICO DE COMPRAS DO JOGADOR
async function loadOrderHistory() {
  const tbody = document.getElementById('profile-orders-tbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/orders/history', {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();

    if (res.ok && data.orders) {
      if (data.orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--muted);">Sem compras realizadas até o momento.</td></tr>';
        return;
      }

      tbody.innerHTML = '';
      data.orders.forEach(order => {
        const dateStr = new Date(order.created_at).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        const itemsListStr = order.items.map(it => `${it.quantity}x ${it.product_name}`).join('<br>');
        
        let rconStatusStr = 'Pendente';
        let rconBadgeClass = 'pending';
        const deliveryStatuses = order.items.map(it => it.delivery_status);

        if (deliveryStatuses.includes('error')) {
          rconStatusStr = 'Erro / Suporte';
          rconBadgeClass = 'error';
        } else if (deliveryStatuses.includes('delivered')) {
          if (deliveryStatuses.every(s => s === 'delivered')) {
            rconStatusStr = 'Entregue';
            rconBadgeClass = 'delivered';
          } else {
            rconStatusStr = 'Parcial';
            rconBadgeClass = 'pending';
          }
        } else if (deliveryStatuses.includes('cancelled')) {
          rconStatusStr = 'Cancelado';
          rconBadgeClass = 'cancelled';
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-family: monospace; font-size: 0.8rem;">#${order.id.substring(0, 8)}</td>
          <td style="font-size: 0.85rem;">${itemsListStr}</td>
          <td style="font-weight: 700; color: var(--primary);">R$ ${parseFloat(order.total_amount).toFixed(2)}</td>
          <td><span class="badge-status ${order.payment_status}">${translatePaymentStatus(order.payment_status)}</span></td>
          <td><span class="badge-status ${rconBadgeClass}">${rconStatusStr}</span></td>
          <td style="font-size: 0.8rem; color: var(--muted);">${dateStr}</td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (err) {
    console.error('Erro ao carregar histórico de pedidos:', err.message);
  }
}

function translatePaymentStatus(status) {
  const map = {
    pending: 'Aguardando',
    approved: 'Aprovado',
    refused: 'Recusado',
    cancelled: 'Cancelado',
    refunded: 'Reembolsado'
  };
  return map[status] || status;
}

// ABRIR TELA DE DETALHE DO PRODUTO (MODAL WORDPRESS-STYLE)
function openProductDetail(productId) {
  const prod = window.catalogProducts.find(p => p.id === productId);
  if (!prod) return;

  const modal = document.getElementById('product-detail-modal');
  if (!modal) return;

  // Hydrate modal info
  const imgBox = document.querySelector('#product-detail-modal .product-modal-img-box');
  if (imgBox) {
    if (prod.imagem_url) {
      imgBox.innerHTML = `<img id="modal-product-icon-img" src="${prod.imagem_url}" style="width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 0 15px rgba(0,255,196,0.25));" alt="${prod.name}">`;
    } else {
      imgBox.innerHTML = `<i id="modal-product-icon" class="${getCategoryIcon(prod.category)}"></i>`;
    }
  }
  document.getElementById('modal-product-category').textContent = prod.category;
  document.getElementById('modal-product-title').textContent = prod.name;
  document.getElementById('modal-product-desc').textContent = prod.description || 'Sem descrição.';

  const varList = document.getElementById('modal-product-variations-list');
  varList.innerHTML = '';

  let selectedVar = prod.variations[0];

  const selectVariation = (v) => {
    selectedVar = v;
    // Atualizar estilo ativo nos botões de variação
    varList.querySelectorAll('.variation-option-btn').forEach(btn => {
      if (parseInt(btn.getAttribute('data-var-id'), 10) === v.id) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Calcular preços e descontos VIP se aplicável
    const priceVal = getVariationPrice(v);
    
    document.getElementById('modal-product-price').textContent = `R$ ${priceVal.toFixed(2)}`;
    
    const oldPriceEl = document.getElementById('modal-product-old-price');
    const vipDiscount = (currentUser && currentUser.vip_discount_percent) || 0;
    if (vipDiscount > 0 && v.permite_desconto !== false) {
      oldPriceEl.style.display = 'block';
      oldPriceEl.textContent = `R$ ${parseFloat(v.valor || v.price).toFixed(2)}`;
    } else {
      oldPriceEl.style.display = 'none';
    }

    // Atualizar limite por sobrevivente
    const limitEl = document.getElementById('modal-product-limit');
    if (v.purchase_limit > 0) {
      limitEl.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> Limite: ${v.purchase_limit} por sobrevivente`;
    } else {
      limitEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> Sem limite de compra`;
    }

    // Configurar ação do botão de compra
    const buyBtn = document.getElementById('modal-product-buy-btn');
    buyBtn.onclick = () => {
      addToCart(v.id, prod.name, (v.nome || v.name), priceVal, v.purchase_limit);
      closeModal('product-detail-modal');
    };
  };

  // Renderizar botões para seleção de cada variação do produto
  prod.variations.forEach(v => {
    const btn = document.createElement('button');
    btn.className = 'variation-option-btn';
    btn.setAttribute('data-var-id', v.id);
    
    const displayPrice = getVariationPrice(v);
    btn.innerHTML = `
      <span>${v.nome || v.name}</span>
      <span class="var-price-badge">R$ ${displayPrice.toFixed(2)}</span>
    `;
    btn.onclick = () => selectVariation(v);
    varList.appendChild(btn);
  });

  // Selecionar a primeira variação por padrão
  if (prod.variations.length > 0) {
    selectVariation(prod.variations[0]);
  }

  modal.classList.add('open');
}
