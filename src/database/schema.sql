-- Habilitar a extensão uuid-ossp se disponível
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TABELA DE USUÁRIOS
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    ark_id VARCHAR(50) UNIQUE, -- ID do jogador ARK
    is_verified BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(255),
    reset_token VARCHAR(255),
    reset_token_expires TIMESTAMP,
    role VARCHAR(20) DEFAULT 'user', -- 'user' ou 'admin'
    is_banned BOOLEAN DEFAULT FALSE,
    
    -- Estatísticas do Jogador (para rankings dinâmicos)
    character_name VARCHAR(100),
    character_level INT DEFAULT 1,
    kills INT DEFAULT 0,
    deaths INT DEFAULT 0,
    playtime_hours INT DEFAULT 0,
    coins_balance INT DEFAULT 0,
    vip_status VARCHAR(50) DEFAULT 'Membro',
    vip_expires_at TIMESTAMP,
    vip_discount_percent INT DEFAULT 0,
    tribe_name VARCHAR(100) DEFAULT 'Sem Tribo',
    tribe_role VARCHAR(50) DEFAULT 'Membro',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. TABELA DE PRODUTOS PAI (produtos)
CREATE TABLE IF NOT EXISTS produtos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    slug VARCHAR(150) NOT NULL UNIQUE,
    categoria VARCHAR(80) NOT NULL,
    descricao TEXT NULL,
    imagem_url VARCHAR(255) NULL,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. TABELA DE VARIAÇÕES DE PRODUTOS (produto_variacoes)
CREATE TABLE IF NOT EXISTS produto_variacoes (
    id SERIAL PRIMARY KEY,
    produto_id INT NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
    nome VARCHAR(180) NOT NULL,
    tipo VARCHAR(80) NOT NULL,
    level INT NULL,
    descricao TEXT NOT NULL,
    valor NUMERIC(10, 2) NOT NULL,
    comando_rcon TEXT NOT NULL,
    ativo BOOLEAN DEFAULT TRUE,
    purchase_limit INT DEFAULT 0, -- 0 para ilimitado
    permite_desconto BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. TABELA DE CONFIGURAÇÃO DO SERVIDOR (Singleton Key-Value)
CREATE TABLE IF NOT EXISTS server_config (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL
);

-- 5. TABELA DE PEDIDOS
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    is_gift BOOLEAN DEFAULT FALSE,
    recipient_ark_id VARCHAR(50) NOT NULL,
    payment_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'refused', 'cancelled', 'refunded'
    payment_id VARCHAR(100) UNIQUE,
    total_amount NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. TABELA DE ITENS DO PEDIDO (Aponta para produto_variacoes)
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    variation_id INT REFERENCES produto_variacoes(id) ON DELETE SET NULL,
    quantity INT DEFAULT 1,
    price NUMERIC(10, 2) NOT NULL
);

-- 7. TABELA DE FILA DE ENTREGA RCON
CREATE TABLE IF NOT EXISTS delivery_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id UUID REFERENCES order_items(id) ON DELETE CASCADE,
    recipient_ark_id VARCHAR(50) NOT NULL,
    rcon_command TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'delivered', 'error', 'cancelled'
    attempts INT DEFAULT 0,
    last_attempt_at TIMESTAMP,
    error_log TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. TABELA DE LOGS DE AUDITORIA
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    ip_address VARCHAR(45),
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- INSERIR CONFIGURAÇÕES INICIAIS PADRÃO
INSERT INTO server_config (key, value) VALUES
('nitrado_ip', '127.0.0.1'),
('nitrado_port', '27015'),
('nitrado_password', 'senha_rcon_padrao'),
('email_host', 'smtp.mailtrap.io'),
('email_port', '2525'),
('email_user', 'mock_user'),
('email_pass', 'mock_pass'),
('email_from', 'no-reply@punisherbrasil.com.br'),
('mercado_pago_access_token', 'APP_USR-mock-token-for-testing'),
('mercado_pago_public_key', 'APP_USR-mock-public-key'),
('mercado_pago_webhook_secret', 'mp_secret_webhook_verification'),
('rank_show_playtime', 'true'),
('rank_show_purchases', 'true'),
('rank_show_coins', 'true'),
('rank_show_vip', 'true')
ON CONFLICT (key) DO NOTHING;

-- INSERIR PRODUTOS PAI (produtos)
INSERT INTO produtos (nome, slug, categoria, descricao) VALUES
('Giganotosaurus', 'giganotosaurus', 'Dinos PvP', 'Dino de guerra usado em PvP, raid e defesa de território.'),
('Carcharodontosaurus', 'carcharodontosaurus', 'Dinos PvP', 'Predador de alto dano usado para PvP e limpeza de bases.'),
('Rex', 'rex', 'Boss', 'Dino clássico para bosses e combate pesado.'),
('Yutyrannus', 'yutyrannus', 'Boss', 'Dino de suporte usado para buff em boss fights.'),
('Therizinosaurus', 'therizinosaurus', 'Boss', 'Dino forte para bosses, PvP e farm.'),
('Daeodon', 'daeodon', 'Boss', 'Dino de cura usado em bosses e suporte.'),
('Stegosaurus', 'stegosaurus', 'Tank / Soak', 'Dino tank usado para puxar torretes e fazer soak.'),
('Triceratops', 'triceratops', 'Tank / Soak', 'Dino resistente usado para soak e avanço em raid.'),
('Carbonemys', 'carbonemys', 'Tank / Soak', 'Tartaruga usada para soak inicial e defesa.'),
('Brontosaurus', 'brontosaurus', 'Tank / Soak', 'Dino gigante usado para soak pesado.'),
('Arthropluera', 'arthropluera', 'Raid', 'Dino usado para dano em estruturas.'),
('Ankylosaurus', 'ankylosaurus', 'Farm', 'Dino usado para farm de metal.'),
('Doedicurus', 'doedicurus', 'Farm', 'Dino usado para farm de pedra.'),
('Castoroides', 'castoroides', 'Farm', 'Dino usado para farm de madeira.'),
('Argentavis', 'argentavis', 'Farm / Transporte', 'Dino voador usado para transporte e farm.'),
('Rhyniognatha', 'rhyniognatha', 'Mobilidade PvP', 'Dino premium usado para transporte pesado e PvP.'),
('Desmodus', 'desmodus', 'Mobilidade PvP', 'Dino voador usado para mobilidade e PvP.'),
('Shadowmane', 'shadowmane', 'PvP Premium', 'Dino forte para combate terrestre e PvP.'),
('Maewing', 'maewing', 'Criação / Mobilidade', 'Dino usado para criação e mobilidade.'),
('Metal Ingot', 'metal-ingot', 'Recursos', 'Metal refinado para construções e equipamentos.'),
('Cementing Paste', 'cementing-paste', 'Recursos', 'Pasta de cimento usada em construções avançadas.'),
('Polymer', 'polymer', 'Recursos', 'Polímero usado em craft avançado.'),
('Organic Polymer', 'organic-polymer', 'Recursos', 'Polímero orgânico para craft rápido.'),
('Crystal', 'crystal', 'Recursos', 'Cristal usado em eletrônicos e estruturas.'),
('Obsidian', 'obsidian', 'Recursos', 'Obsidiana usada em craft avançado.'),
('Silica Pearls', 'silica-pearls', 'Recursos', 'Pérolas usadas em eletrônicos e Tek.'),
('Black Pearls', 'black-pearls', 'Recursos', 'Pérolas negras usadas em itens avançados.'),
('Element', 'element', 'Tek', 'Elemento usado para energia e equipamentos Tek.'),
('Tek Replicator', 'tek-replicator', 'Tek', 'Estrutura Tek usada para craft avançado.'),
('Tek Generator', 'tek-generator', 'Tek', 'Gerador Tek para alimentar estruturas.'),
('Tek Transmitter', 'tek-transmitter', 'Tek', 'Transmissor Tek usado para upload e transferência.'),
('Tek Teleporter', 'tek-teleporter', 'Tek', 'Teleporte Tek para movimentação rápida.'),
('Kit Iniciante', 'kit-iniciante', 'Kits', 'Kit básico para novos jogadores.'),
('Kit Farm', 'kit-farm', 'Kits', 'Kit focado em farm inicial e médio.'),
('Kit Guerra Pequeno', 'kit-guerra-pequeno', 'Kits PvP', 'Kit básico para PvP e raid pequena.'),
('Kit Guerra Médio', 'kit-guerra-medio', 'Kits PvP', 'Kit intermediário para raid.'),
('Kit Guerra Grande', 'kit-guerra-grande', 'Kits PvP', 'Kit completo para guerra.'),
('VIP Bronze', 'vip-bronze', 'VIP', 'Plano VIP Bronze com 10% de desconto na loja virtual por 30 dias.'),
('VIP Prata', 'vip-prata', 'VIP', 'Plano VIP Prata com 30% de desconto na loja virtual por 30 dias.'),
('VIP Ouro', 'vip-ouro', 'VIP', 'Plano VIP Ouro com 50% de desconto na loja virtual por 30 dias.'),
('Moedas de Ouro', 'moedas-ouro', 'Coins', 'Moedas para gastar na loja do servidor ou resgatar no perfil.'),
('Pyromane', 'pyromane', 'PvP Premium', 'Criatura de fogo com altíssima mobilidade e capacidade de se transformar em montaria de ombro.')
ON CONFLICT (slug) DO NOTHING;

-- INSERIR VARIAÇÕES DE PRODUTOS (produto_variacoes)
-- 1. Giganotosaurus
-- 1. Giganotosaurus
INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, 'Giganotosaurus Fêmea Lv 1', 'Fêmea', 1, 'Uma fêmea Giganotosaurus level 1 ideal para clonagem rápida e reprodução.', 10.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Giganotosaurus/BionicGigant_Character_BP.BionicGigant_Character_BP\' gender=female level=1' FROM produtos WHERE slug = 'giganotosaurus'
UNION ALL SELECT id, 'Giganotosaurus Macho Alpha Lv 225', 'Macho Alpha', 225, 'Um Giganotosaurus macho level 225 para acasalar com suas fêmeas e fortalecer sua linhagem.', 25.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Giganotosaurus/BionicGigant_Character_BP.BionicGigant_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'giganotosaurus'
UNION ALL SELECT id, 'Casal de Giganotosaurus Lv 225', 'Casal', 225, 'Casal de Giganotosaurus level 225 para amedrontar seus inimigos no PvP.', 30.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Giganotosaurus/BionicGigant_Character_BP.BionicGigant_Character_BP\' gender=female level=225 && scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Giganotosaurus/BionicGigant_Character_BP.BionicGigant_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'giganotosaurus';

-- 2. Carcharodontosaurus
INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, 'Carcharodontosaurus Fêmea Lv 1', 'Fêmea', 1, 'Uma fêmea Carcharodontosaurus level 1 ideal para clonagem e reprodução.', 10.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Carcharodontosaurus/Carcha_Character_BP.Carcha_Character_BP\' gender=female level=1' FROM produtos WHERE slug = 'carcharodontosaurus'
UNION ALL SELECT id, 'Carcharodontosaurus Macho Alpha Lv 225', 'Macho Alpha', 225, 'Um Carcharodontosaurus macho level 225 para PvP, raid e defesa de base.', 25.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Carcharodontosaurus/Carcha_Character_BP.Carcha_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'carcharodontosaurus'
UNION ALL SELECT id, 'Casal de Carcharodontosaurus Lv 225', 'Casal', 225, 'Casal de Carcharodontosaurus level 225 para criação e guerra.', 30.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Carcharodontosaurus/Carcha_Character_BP.Carcha_Character_BP\' gender=female level=225 && scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Carcharodontosaurus/Carcha_Character_BP.Carcha_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'carcharodontosaurus';

-- 3. Stegosaurus
INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, 'Stegosaurus Fêmea Lv 1', 'Fêmea', 1, 'Uma fêmea Stegosaurus level 1 ideal para clonagem e reprodução de tanks.', 8.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Stegosaurus/Stego_Character_BP.Stego_Character_BP\' gender=female level=1' FROM produtos WHERE slug = 'stegosaurus'
UNION ALL SELECT id, 'Stegosaurus Macho Alpha Lv 225', 'Macho Alpha', 225, 'Um Stegosaurus macho level 225 feito para soak e avanço em raids.', 20.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Stegosaurus/Stego_Character_BP.Stego_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'stegosaurus'
UNION ALL SELECT id, 'Casal de Stegosaurus Lv 225', 'Casal', 225, 'Casal de Stegosaurus level 225 para criar sua linha de tanks PvP.', 25.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Stegosaurus/Stego_Character_BP.Stego_Character_BP\' gender=female level=225 && scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Stegosaurus/Stego_Character_BP.Stego_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'stegosaurus';

-- 4. Triceratops
INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, 'Triceratops Fêmea Lv 1', 'Fêmea', 1, 'Uma fêmea Triceratops level 1 ideal para clonagem e reprodução.', 8.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Triceratops/Trike_Character_BP.Trike_Character_BP\' gender=female level=1' FROM produtos WHERE slug = 'triceratops'
UNION ALL SELECT id, 'Triceratops Macho Alpha Lv 225', 'Macho Alpha', 225, 'Um Triceratops macho level 225 resistente para soak em torres.', 20.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Triceratops/Trike_Character_BP.Trike_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'triceratops'
UNION ALL SELECT id, 'Casal de Triceratops Lv 225', 'Casal', 225, 'Casal de Triceratops level 225 para raid e defesa.', 25.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Triceratops/Trike_Character_BP.Trike_Character_BP\' gender=female level=225 && scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Triceratops/Trike_Character_BP.Trike_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'triceratops';

-- 5. Carbonemys
INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, 'Carbonemys Fêmea Lv 1', 'Fêmea', 1, 'Uma fêmea Carbonemys level 1 para clonagem barata.', 5.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Turtle/Turtle_Character_BP.Turtle_Character_BP\' gender=female level=1' FROM produtos WHERE slug = 'carbonemys'
UNION ALL SELECT id, 'Carbonemys Macho Alpha Lv 225', 'Macho Alpha', 225, 'Uma Carbonemys macho level 225 para soak inicial.', 15.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Turtle/Turtle_Character_BP.Turtle_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'carbonemys'
UNION ALL SELECT id, 'Casal de Carbonemys Lv 225', 'Casal', 225, 'Casal de Carbonemys level 225 para defesa e soak.', 20.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Turtle/Turtle_Character_BP.Turtle_Character_BP\' gender=female level=225 && scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Turtle/Turtle_Character_BP.Turtle_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'carbonemys';

-- 6. Brontosaurus
INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, 'Brontosaurus Fêmea Lv 1', 'Fêmea', 1, 'Uma fêmea Brontosaurus level 1 para reprodução.', 10.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Sauropod/Sauropod_Character_BP.Sauropod_Character_BP\' gender=female level=1' FROM produtos WHERE slug = 'brontosaurus'
UNION ALL SELECT id, 'Brontosaurus Macho Alpha Lv 225', 'Macho Alpha', 225, 'Um Brontosaurus macho level 225 para soak pesado.', 25.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Sauropod/Sauropod_Character_BP.Sauropod_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'brontosaurus'
UNION ALL SELECT id, 'Casal de Brontosaurus Lv 225', 'Casal', 225, 'Casal de Brontosaurus level 225 para raid pesada.', 30.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Sauropod/Sauropod_Character_BP.Sauropod_Character_BP\' gender=female level=225 && scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Sauropod/Sauropod_Character_BP.Sauropod_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'brontosaurus';

-- 7. Rex
INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, 'Rex Fêmea Lv 1', 'Fêmea', 1, 'Uma fêmea Rex level 1 para reprodução e clonagem.', 5.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Rex/Rex_Character_BP.Rex_Character_BP\' gender=female level=1' FROM produtos WHERE slug = 'rex'
UNION ALL SELECT id, 'Rex Macho Alpha Lv 225', 'Macho Alpha', 225, 'Um Rex macho level 225 para bosses e reprodução.', 15.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Rex/Rex_Character_BP.Rex_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'rex'
UNION ALL SELECT id, 'Casal de Rex Lv 225', 'Casal', 225, 'Casal de Rex level 225 para boss fight.', 20.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Rex/Rex_Character_BP.Rex_Character_BP\' gender=female level=225 && scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Rex/Rex_Character_BP.Rex_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'rex';

-- 8. Yutyrannus
INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, 'Yutyrannus Fêmea Lv 1', 'Fêmea', 1, 'Uma fêmea Yutyrannus level 1 para reprodução.', 5.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Yutyrannus/Yutyrannus_Character_BP.Yutyrannus_Character_BP\' gender=female level=1' FROM produtos WHERE slug = 'yutyrannus'
UNION ALL SELECT id, 'Yutyrannus Macho Alpha Lv 225', 'Macho Alpha', 225, 'Um Yutyrannus macho level 225 para buff em bosses.', 15.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Yutyrannus/Yutyrannus_Character_BP.Yutyrannus_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'yutyrannus'
UNION ALL SELECT id, 'Casal de Yutyrannus Lv 225', 'Casal', 225, 'Casal de Yutyrannus level 225 para suporte em bosses.', 20.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Yutyrannus/Yutyrannus_Character_BP.Yutyrannus_Character_BP\' gender=female level=225 && scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Yutyrannus/Yutyrannus_Character_BP.Yutyrannus_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'yutyrannus';

-- 9. Therizinosaurus
INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, 'Therizinosaurus Fêmea Lv 1', 'Fêmea', 1, 'Uma fêmea Therizinosaurus level 1 para reprodução.', 5.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Therizino/Therizino_Character_BP.Therizino_Character_BP\' gender=female level=1' FROM produtos WHERE slug = 'therizinosaurus'
UNION ALL SELECT id, 'Therizinosaurus Macho Alpha Lv 225', 'Macho Alpha', 225, 'Um Therizinosaurus macho level 225 para bosses e PvP.', 15.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Therizino/Therizino_Character_BP.Therizino_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'therizinosaurus'
UNION ALL SELECT id, 'Casal de Therizinosaurus Lv 225', 'Casal', 225, 'Casal de Therizinosaurus level 225 para boss fight.', 20.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Therizino/Therizino_Character_BP.Therizino_Character_BP\' gender=female level=225 && scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Therizino/Therizino_Character_BP.Therizino_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'therizinosaurus';

-- 10. Daeodon
INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, 'Daeodon Fêmea Lv 1', 'Fêmea', 1, 'Uma fêmea Daeodon level 1 para reprodução.', 5.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Daeodon/Daeodon_Character_BP.Daeodon_Character_BP\' gender=female level=1' FROM produtos WHERE slug = 'daeodon'
UNION ALL SELECT id, 'Daeodon Macho Alpha Lv 225', 'Macho Alpha', 225, 'Um Daeodon macho level 225 para cura em bosses.', 15.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Daeodon/Daeodon_Character_BP.Daeodon_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'daeodon'
UNION ALL SELECT id, 'Casal de Daeodon Lv 225', 'Casal', 225, 'Casal de Daeodon level 225 para suporte e cura.', 20.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Daeodon/Daeodon_Character_BP.Daeodon_Character_BP\' gender=female level=225 && scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Daeodon/Daeodon_Character_BP.Daeodon_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'daeodon';

-- 11. Ankylosaurus
INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, 'Ankylosaurus Fêmea Lv 1', 'Fêmea', 1, 'Uma fêmea Ankylosaurus level 1 para reprodução.', 5.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Ankylo/Ankylo_Character_BP.Ankylo_Character_BP\' gender=female level=1' FROM produtos WHERE slug = 'ankylosaurus'
UNION ALL SELECT id, 'Ankylosaurus Macho Alpha Lv 225', 'Macho Alpha', 225, 'Um Ankylosaurus macho level 225 para farm de metal.', 10.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Ankylo/Ankylo_Character_BP.Ankylo_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'ankylosaurus'
UNION ALL SELECT id, 'Casal de Ankylosaurus Lv 225', 'Casal', 225, 'Casal de Ankylosaurus level 225 para farm avançado.', 15.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Ankylo/Ankylo_Character_BP.Ankylo_Character_BP\' gender=female level=225 && scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Ankylo/Ankylo_Character_BP.Ankylo_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'ankylosaurus';

-- 12. Doedicurus
INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, 'Doedicurus Fêmea Lv 1', 'Fêmea', 1, 'Uma fêmea Doedicurus level 1 para reprodução.', 5.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Doedicurus/Doedic_Character_BP.Doedic_Character_BP\' gender=female level=1' FROM produtos WHERE slug = 'doedicurus'
UNION ALL SELECT id, 'Doedicurus Macho Alpha Lv 225', 'Macho Alpha', 225, 'Um Doedicurus macho level 225 para farm de pedra.', 10.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Doedicurus/Doedic_Character_BP.Doedic_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'doedicurus'
UNION ALL SELECT id, 'Casal de Doedicurus Lv 225', 'Casal', 225, 'Casal de Doedicurus level 225 para farm.', 15.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Doedicurus/Doedic_Character_BP.Doedic_Character_BP\' gender=female level=225 && scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Doedicurus/Doedic_Character_BP.Doedic_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'doedicurus';

-- 13. Dinos adicionais (Arthropluera, Castoroides, Argentavis, Rhyniognatha, Desmodus, Shadowmane, Maewing)
INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, 'Arthropluera Macho Lv 225', 'Macho', 225, 'Arthropluera level 225 ideal para raid e quebra de armadura.', 15.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Arthropluera/Arthro_Character_BP.Arthro_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'arthropluera'
UNION ALL SELECT id, 'Casal de Arthropluera Lv 225', 'Casal', 225, 'Casal de Arthropluera level 225 para criação.', 20.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Arthropluera/Arthro_Character_BP.Arthro_Character_BP\' gender=female level=225 && scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Arthropluera/Arthro_Character_BP.Arthro_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'arthropluera';

INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, 'Castoroides Macho Lv 225', 'Macho', 225, 'Castoroides level 225 ideal para coletar madeira no início.', 10.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Beaver/Beaver_Character_BP.Beaver_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'castoroides'
UNION ALL SELECT id, 'Casal de Castoroides Lv 225', 'Casal', 225, 'Casal de Castoroides level 225 para reprodução.', 15.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Beaver/Beaver_Character_BP.Beaver_Character_BP\' gender=female level=225 && scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Beaver/Beaver_Character_BP.Beaver_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'castoroides';

INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, 'Argentavis Macho Lv 225', 'Macho', 225, 'Argentavis level 225 excelente voador de transporte e peso.', 10.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Argentavis/Argent_Character_BP.Argent_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'argentavis'
UNION ALL SELECT id, 'Casal de Argentavis Lv 225', 'Casal', 225, 'Casal de Argentavis level 225 para linhagem de transporte.', 15.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Argentavis/Argent_Character_BP.Argent_Character_BP\' gender=female level=225 && scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Argentavis/Argent_Character_BP.Argent_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'argentavis';

INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, 'Rhyniognatha Macho Lv 225', 'Macho', 225, 'Rhyniognatha level 225 premium, voador capaz de carregar estruturas.', 30.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Rhyniognatha/Rhynio_Character_BP.Rhynio_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'rhyniognatha'
UNION ALL SELECT id, 'Casal de Rhyniognatha Lv 225', 'Casal', 225, 'Casal de Rhyniognatha level 225 para cruzamento.', 45.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Rhyniognatha/Rhynio_Character_BP.Rhynio_Character_BP\' gender=female level=225 && scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Rhyniognatha/Rhynio_Character_BP.Rhynio_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'rhyniognatha';

INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, 'Desmodus Macho Lv 225', 'Macho', 225, 'Desmodus level 225, morcego voador com alta mobilidade e elixires.', 20.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Desmodus/Desmodus_Character_BP.Desmodus_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'desmodus'
UNION ALL SELECT id, 'Casal de Desmodus Lv 225', 'Casal', 225, 'Casal de Desmodus level 225 para produção.', 30.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Desmodus/Desmodus_Character_BP.Desmodus_Character_BP\' gender=female level=225 && scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/Desmodus/Desmodus_Character_BP.Desmodus_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'desmodus';

INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, 'Shadowmane Macho Lv 225', 'Macho', 225, 'Shadowmane level 225 premium com buffs de stealth e combate terrestre.', 25.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/LionfishLion/LionfishLion_Character_BP.LionfishLion_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'shadowmane'
UNION ALL SELECT id, 'Casal de Shadowmane Lv 225', 'Casal', 225, 'Casal de Shadowmane level 225.', 40.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/LionfishLion/LionfishLion_Character_BP.LionfishLion_Character_BP\' gender=female level=225 && scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/LionfishLion/LionfishLion_Character_BP.LionfishLion_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'shadowmane';

INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, 'Maewing Macho Lv 225', 'Macho', 225, 'Maewing level 225 perfeito para criar bebês dinos e planar no mapa.', 15.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/MilkGlider/MilkGlider_Character_BP.MilkGlider_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'maewing'
UNION ALL SELECT id, 'Casal de Maewing Lv 225', 'Casal', 225, 'Casal de Maewing level 225.', 25.00, 'scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/MilkGlider/MilkGlider_Character_BP.MilkGlider_Character_BP\' gender=female level=225 && scriptcommand asabot spawndino {ARK_ID} \'/Game/PrimalEarth/Dinos/MilkGlider/MilkGlider_Character_BP.MilkGlider_Character_BP\' gender=male level=225' FROM produtos WHERE slug = 'maewing';

-- 14. Recursos e Pacotes (Metal Ingot, Cementing Paste, Polymer, Organic Polymer, Crystal, Obsidian, Silica Pearls, Black Pearls)
-- 14. Recursos e Pacotes (Metal Ingot, Cementing Paste, Polymer, Organic Polymer, Crystal, Obsidian, Silica Pearls, Black Pearls)
INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, '50.000 Metal Ingot', 'Recurso', NULL::integer, 'Pacote com 50.000 Metal Ingot para construção e craft.', 15.00, 'scriptcommand asabot spawnitem {ARK_ID} \'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_MetalIngot.PrimalItemResource_MetalIngot\' quantity=50000 blueprint=no' FROM produtos WHERE slug = 'metal-ingot'
UNION ALL SELECT id, '100.000 Metal Ingot', 'Recurso', NULL::integer, 'Pacote com 100.000 Metal Ingot para grandes construções.', 25.00, 'scriptcommand asabot spawnitem {ARK_ID} \'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_MetalIngot.PrimalItemResource_MetalIngot\' quantity=100000 blueprint=no' FROM produtos WHERE slug = 'metal-ingot';

INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, '50.000 Cementing Paste', 'Recurso', NULL::integer, 'Pacote com 50.000 Cementing Paste.', 15.00, 'scriptcommand asabot spawnitem {ARK_ID} \'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_CementingPaste.PrimalItemResource_CementingPaste\' quantity=50000 blueprint=no' FROM produtos WHERE slug = 'cementing-paste'
UNION ALL SELECT id, '100.000 Cementing Paste', 'Recurso', NULL::integer, 'Pacote com 100.000 Cementing Paste.', 25.00, 'scriptcommand asabot spawnitem {ARK_ID} \'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_CementingPaste.PrimalItemResource_CementingPaste\' quantity=100000 blueprint=no' FROM produtos WHERE slug = 'cementing-paste';

INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, '10.000 Polymer', 'Recurso', NULL::integer, 'Pacote com 10.000 Polymer para craft avançado.', 15.00, 'scriptcommand asabot spawnitem {ARK_ID} \'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Polymer.PrimalItemResource_Polymer\' quantity=10000 blueprint=no' FROM produtos WHERE slug = 'polymer';

INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, '10.000 Organic Polymer', 'Recurso', NULL::integer, 'Pacote com 10.000 Organic Polymer para craft rápido.', 10.00, 'scriptcommand asabot spawnitem {ARK_ID} \'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_PolymerOrganic.PrimalItemResource_PolymerOrganic\' quantity=10000 blueprint=no' FROM produtos WHERE slug = 'organic-polymer';

INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, '20.000 Crystal', 'Recurso', NULL::integer, 'Pacote com 20.000 Crystal.', 10.00, 'scriptcommand asabot spawnitem {ARK_ID} \'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Crystal.PrimalItemResource_Crystal\' quantity=20000 blueprint=no' FROM produtos WHERE slug = 'crystal';

INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, '20.000 Obsidian', 'Recurso', NULL::integer, 'Pacote com 20.000 Obsidian.', 10.00, 'scriptcommand asabot spawnitem {ARK_ID} \'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Obsidian.PrimalItemResource_Obsidian\' quantity=20000 blueprint=no' FROM produtos WHERE slug = 'obsidian';

INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, '20.000 Silica Pearls', 'Recurso', NULL::integer, 'Pacote com 20.000 Silica Pearls.', 15.00, 'scriptcommand asabot spawnitem {ARK_ID} \'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_SiliconPearls.PrimalItemResource_SiliconPearls\' quantity=20000 blueprint=no' FROM produtos WHERE slug = 'silica-pearls';

INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, '20.000 Black Pearls', 'Recurso', NULL::integer, 'Pacote com 20.000 Black Pearls para craft avançado.', 20.00, 'scriptcommand asabot spawnitem {ARK_ID} \'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_BlackPearl.PrimalItemResource_BlackPearl\' quantity=20000 blueprint=no' FROM produtos WHERE slug = 'black-pearls';

-- 15. Elemento e Tek
INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, '500 Element', 'Tek', NULL::integer, 'Pacote com 500 Element para energia e craft Tek.', 15.00, 'scriptcommand asabot spawnitem {ARK_ID} \'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Element.PrimalItemResource_Element\' quantity=500 blueprint=no' FROM produtos WHERE slug = 'element'
UNION ALL SELECT id, '1.000 Element', 'Tek', NULL::integer, 'Pacote com 1.000 Element.', 25.00, 'scriptcommand asabot spawnitem {ARK_ID} \'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Element.PrimalItemResource_Element\' quantity=1000 blueprint=no' FROM produtos WHERE slug = 'element'
UNION ALL SELECT id, '2.500 Element', 'Tek', NULL::integer, 'Pacote com 2.500 Element.', 50.00, 'scriptcommand asabot spawnitem {ARK_ID} \'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Element.PrimalItemResource_Element\' quantity=2500 blueprint=no' FROM produtos WHERE slug = 'element'
UNION ALL SELECT id, '5.000 Element', 'Tek', NULL::integer, 'Pacote com 5.000 Element.', 90.00, 'scriptcommand asabot spawnitem {ARK_ID} \'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Element.PrimalItemResource_Element\' quantity=5000 blueprint=no' FROM produtos WHERE slug = 'element';

INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, 'Tek Replicator', 'Estrutura Tek', NULL::integer, 'Uma unidade de Tek Replicator.', 15.00, 'scriptcommand asabot spawnitem {ARK_ID} \'/Game/PrimalEarth/CoreBlueprints/Items/Structures/Misc/PrimalItemStructure_TekReplicator.PrimalItemStructure_TekReplicator\' quantity=1 blueprint=no' FROM produtos WHERE slug = 'tek-replicator';

INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, 'Tek Generator', 'Estrutura Tek', NULL::integer, 'Uma unidade de Tek Generator.', 10.00, 'scriptcommand asabot spawnitem {ARK_ID} \'/Game/PrimalEarth/CoreBlueprints/Items/Structures/Misc/PrimalItemStructure_TekGenerator.PrimalItemStructure_TekGenerator\' quantity=1 blueprint=no' FROM produtos WHERE slug = 'tek-generator';

INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, 'Tek Transmitter', 'Estrutura Tek', NULL::integer, 'Uma unidade de Tek Transmitter.', 15.00, 'scriptcommand asabot spawnitem {ARK_ID} \'/Game/PrimalEarth/CoreBlueprints/Items/Structures/Misc/PrimalItemStructure_TekTransmitter.PrimalItemStructure_TekTransmitter\' quantity=1 blueprint=no' FROM produtos WHERE slug = 'tek-transmitter';

INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, 'Tek Teleporter', 'Estrutura Tek', NULL::integer, 'Uma unidade de Tek Teleporter.', 20.00, 'scriptcommand asabot spawnitem {ARK_ID} \'/Game/PrimalEarth/CoreBlueprints/Items/Structures/Misc/PrimalItemStructure_TekTeleporter.PrimalItemStructure_TekTeleporter\' quantity=1 blueprint=no' FROM produtos WHERE slug = 'tek-teleporter';

-- 16. Kits
INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon, ativo)
SELECT id, 'Kit Iniciante', 'Kit', NULL::integer, 'Kit básico com recursos e equipamentos para começar no servidor.', 10.00, 'scriptcommand asabot spawnitem {ARK_ID} \'kit_iniciante\' quantity=1 blueprint=no', FALSE FROM produtos WHERE slug = 'kit-iniciante';

INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon, ativo)
SELECT id, 'Kit Farm', 'Kit', NULL::integer, 'Kit com dinos e recursos focados em farm.', 25.00, 'scriptcommand asabot spawnitem {ARK_ID} \'kit_farm\' quantity=1 blueprint=no', FALSE FROM produtos WHERE slug = 'kit-farm';

INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon, ativo)
SELECT id, 'Kit Guerra Pequeno', 'Kit PvP', NULL::integer, 'Kit básico para PvP, defesa e raid pequena.', 25.00, 'scriptcommand asabot spawnitem {ARK_ID} \'kit_guerra_pequeno\' quantity=1 blueprint=no', FALSE FROM produtos WHERE slug = 'kit-guerra-pequeno';

INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon, ativo)
SELECT id, 'Kit Guerra Médio', 'Kit PvP', NULL::integer, 'Kit intermediário para guerras e raids.', 50.00, 'scriptcommand asabot spawnitem {ARK_ID} \'kit_guerra_medio\' quantity=1 blueprint=no', FALSE FROM produtos WHERE slug = 'kit-guerra-medio';

INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon, ativo)
SELECT id, 'Kit Guerra Grande', 'Kit PvP', NULL::integer, 'Kit completo para raid e guerra pesada.', 100.00, 'scriptcommand asabot spawnitem {ARK_ID} \'kit_guerra_grande\' quantity=1 blueprint=no', FALSE FROM produtos WHERE slug = 'kit-guerra-grande';

-- 17. VIPs
INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, 'VIP Bronze 30 Dias', 'VIP', NULL::integer, 'Plano VIP Bronze com 10% de desconto na loja por 30 dias.', 50.00, 'setvip {ARK_ID} bronze 30' FROM produtos WHERE slug = 'vip-bronze';

INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, 'VIP Prata 30 Dias', 'VIP', NULL::integer, 'Plano VIP Prata com 30% de desconto na loja por 30 dias.', 75.00, 'setvip {ARK_ID} prata 30' FROM produtos WHERE slug = 'vip-prata';

INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, 'VIP Ouro 30 Dias', 'VIP', NULL::integer, 'Plano VIP Ouro com 50% de desconto na loja por 30 dias.', 100.00, 'setvip {ARK_ID} ouro 30' FROM produtos WHERE slug = 'vip-ouro';

INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, '1.000 Moedas de Ouro', 'Coins', NULL::integer, 'Crédito imediato de 1.000 moedas de ouro na carteira.', 10.00, 'addpoints {ARK_ID} 1000' FROM produtos WHERE slug = 'moedas-ouro'
UNION ALL SELECT id, '5.000 Moedas de Ouro', 'Coins', NULL::integer, 'Crédito imediato de 5.000 moedas de ouro na carteira.', 40.00, 'addpoints {ARK_ID} 5000' FROM produtos WHERE slug = 'moedas-ouro'
UNION ALL SELECT id, '10.000 Moedas de Ouro', 'Coins', NULL::integer, 'Crédito imediato de 10.000 moedas de ouro na carteira.', 70.00, 'addpoints {ARK_ID} 10000' FROM produtos WHERE slug = 'moedas-ouro';

-- 19. Pyromane (PvP Premium)
INSERT INTO produto_variacoes (produto_id, nome, tipo, level, descricao, valor, comando_rcon)
SELECT id, 'Pyromane Fêmea Lv 225', 'Fêmea', 225, 'Uma fêmea Pyromane level 225 excelente para mobilidade e combate de fogo.', 20.00, 'scriptcommand asabot spawndino {ARK_ID} ''/Game/ASA/Dinos/FireLion/FireLion_Character_BP.FireLion_Character_BP'' gender=female level=225' FROM produtos WHERE slug = 'pyromane'
UNION ALL SELECT id, 'Pyromane Macho Lv 225', 'Macho', 225, 'Um macho Pyromane level 225 ideal para combate e buff.', 20.00, 'scriptcommand asabot spawndino {ARK_ID} ''/Game/ASA/Dinos/FireLion/FireLion_Character_BP.FireLion_Character_BP'' gender=male level=225' FROM produtos WHERE slug = 'pyromane'
UNION ALL SELECT id, 'Casal de Pyromane Lv 225', 'Casal', 225, 'Casal de Pyromane level 225 para reprodução.', 30.00, 'scriptcommand asabot spawndino {ARK_ID} ''/Game/ASA/Dinos/FireLion/FireLion_Character_BP.FireLion_Character_BP'' gender=female level=225 && scriptcommand asabot spawndino {ARK_ID} ''/Game/ASA/Dinos/FireLion/FireLion_Character_BP.FireLion_Character_BP'' gender=male level=225' FROM produtos WHERE slug = 'pyromane';

-- INSERIR USUÁRIOS DE TESTE (SENHA PADRÃO: 'senha123', admin: 'admin123')
INSERT INTO users (id, username, email, password_hash, ark_id, is_verified, role, character_name, character_level, kills, deaths, playtime_hours, coins_balance, vip_status, vip_expires_at, vip_discount_percent, tribe_name, tribe_role) VALUES
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'admin', 'exemplo@gmail.com', '$2a$10$LxkV.NbEiKV0UIGEHTQMd.1yCH29hZF2F1jOOHUOSgs7IT2dNHRoi', '76561197960287930', true, 'admin', 'PunisherAdmin', 135, 12, 1, 350, 5000, 'VIP Ouro', '2028-06-18 00:00:00', 50, 'Os Punidores', 'Fundador'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02', 'rex_slayer', 'rex@gmail.com', '$2a$10$nKBpid58akHihTMWWzJSsu.amDQ/n4OffZxgvFxc2T9tFmxYMQvlW', '76561197960287931', true, 'user', 'RexSlayer', 115, 234, 45, 180, 1500, 'VIP Bronze', '2028-06-18 00:00:00', 10, 'DinoForce', 'Fundador'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03', 'giga_tamer', 'giga@gmail.com', '$2a$10$nKBpid58akHihTMWWzJSsu.amDQ/n4OffZxgvFxc2T9tFmxYMQvlW', '76561197960287932', true, 'user', 'GigaTamer', 120, 189, 32, 210, 2500, 'VIP Prata', '2028-06-18 00:00:00', 30, 'DinoForce', 'Membro'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a04', 'alpha_tri', 'alpha@gmail.com', '$2a$10$nKBpid58akHihTMWWzJSsu.amDQ/n4OffZxgvFxc2T9tFmxYMQvlW', '76561197960287933', true, 'user', 'AlphaTricera', 98, 45, 89, 75, 200, 'Membro', NULL, 0, 'ShadowTribe', 'Fundador'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a05', 'survivor_bob', 'bob@gmail.com', '$2a$10$nKBpid58akHihTMWWzJSsu.amDQ/n4OffZxgvFxc2T9tFmxYMQvlW', '76561197960287934', true, 'user', 'BeachBob', 45, 2, 78, 15, 0, 'Membro', NULL, 0, 'Sem Tribo', 'Membro')
ON CONFLICT (id) DO NOTHING;

-- Configurar exceções de desconto para planos VIP, Moedas massivas (10.000) e Kit Guerra Grande
UPDATE produto_variacoes SET permite_desconto = FALSE 
WHERE tipo = 'VIP' 
   OR nome LIKE '%VIP%' 
   OR nome LIKE '%10.000%' 
   OR nome = 'Kit Guerra Grande';
