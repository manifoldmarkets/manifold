#!/bin/bash

#############################################
# Setup Manifold no Hostinger VPS
# Frontend (Next.js) + Backend (Express)
#############################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
cat << "EOF"
╔════════════════════════════════════════╗
║   Manifold - Hostinger VPS Setup      ║
║   Frontend + Backend no mesmo servidor║
╚════════════════════════════════════════╝
EOF
echo -e "${NC}"

# Check if running as root
if [ "$EUID" -eq 0 ]; then
   echo -e "${YELLOW}⚠️  Este script não deve ser executado como root${NC}"
   echo "Execute sem sudo. Ele pedirá senha quando necessário."
   exit 1
fi

#############################################
# Passo 1: Instalar Dependências Sistema
#############################################
echo -e "\n${GREEN}📦 Passo 1/9: Instalando dependências do sistema...${NC}"

sudo apt update
sudo apt install -y curl git build-essential

echo -e "${GREEN}✅ Dependências instaladas${NC}"

#############################################
# Passo 2: Instalar Node.js 20
#############################################
echo -e "\n${GREEN}📦 Passo 2/9: Instalando Node.js 20...${NC}"

if ! command -v node &> /dev/null || [[ $(node -v | cut -d'v' -f2 | cut -d'.' -f1) -lt 20 ]]; then
    echo "Instalando Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
else
    echo "Node.js 20+ já instalado"
fi

node --version
npm --version

echo -e "${GREEN}✅ Node.js instalado${NC}"

#############################################
# Passo 3: Instalar PM2
#############################################
echo -e "\n${GREEN}📦 Passo 3/9: Instalando PM2...${NC}"

if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
else
    echo "PM2 já instalado"
fi

pm2 --version

echo -e "${GREEN}✅ PM2 instalado${NC}"

#############################################
# Passo 4: Instalar Nginx
#############################################
echo -e "\n${GREEN}📦 Passo 4/9: Instalando Nginx...${NC}"

if ! command -v nginx &> /dev/null; then
    sudo apt install -y nginx
    sudo systemctl start nginx
    sudo systemctl enable nginx
else
    echo "Nginx já instalado"
fi

sudo systemctl status nginx --no-pager || true

echo -e "${GREEN}✅ Nginx instalado${NC}"

#############################################
# Passo 5: Configurar Backend
#############################################
echo -e "\n${GREEN}🔧 Passo 5/9: Configurando Backend...${NC}"

cd ~/manifold-PolyMarket-/backend-simple/api

if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  Arquivo .env não encontrado${NC}"
    echo "Criando .env a partir de .env.example..."
    cp .env.example .env

    echo -e "${YELLOW}"
    echo "============================================"
    echo "ATENÇÃO: Você precisa editar o arquivo .env"
    echo "Caminho: ~/manifold-PolyMarket-/backend-simple/api/.env"
    echo "============================================"
    echo -e "${NC}"

    read -p "Pressione ENTER para editar agora ou Ctrl+C para sair..."
    nano .env
fi

echo "Instalando dependências do backend..."
npm install --production

echo "Compilando TypeScript..."
npm run build

mkdir -p logs

echo -e "${GREEN}✅ Backend configurado${NC}"

#############################################
# Passo 6: Iniciar Backend com PM2
#############################################
echo -e "\n${GREEN}🚀 Passo 6/9: Iniciando Backend com PM2...${NC}"

# Parar processo antigo se existir
pm2 delete manifold-backend-simple 2>/dev/null || true

# Iniciar novo processo
pm2 start ecosystem.config.js --env production

# Salvar configuração
pm2 save

# Configurar auto-start
pm2 startup | grep "sudo" | sh || true

echo -e "${GREEN}✅ Backend iniciado${NC}"

#############################################
# Passo 7: Configurar Frontend
#############################################
echo -e "\n${GREEN}🎨 Passo 7/9: Configurando Frontend...${NC}"

cd ~/manifold-PolyMarket-/web

if [ ! -f ".env.local" ]; then
    echo -e "${YELLOW}⚠️  Arquivo .env.local não encontrado${NC}"
    echo "Você precisa criar o arquivo .env.local com as variáveis do frontend"

    read -p "Pressione ENTER para criar agora ou Ctrl+C para sair..."

    cat > .env.local << 'ENVEOF'
# API Backend
NEXT_PUBLIC_API_URL=https://api.seudominio.com

# Firebase (Frontend)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Supabase (Frontend)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_KEY=

# Environment
NEXT_PUBLIC_ENV=production
ENVEOF

    nano .env.local
fi

echo "Instalando dependências do frontend..."
npm install --production

echo "Building frontend..."
npm run build

echo -e "${GREEN}✅ Frontend configurado${NC}"

#############################################
# Passo 8: Mover Frontend para /var/www
#############################################
echo -e "\n${GREEN}📁 Passo 8/9: Movendo frontend para /var/www...${NC}"

sudo mkdir -p /var/www/manifold

# Copiar build
sudo cp -r .next/standalone/* /var/www/manifold/ 2>/dev/null || echo "Standalone build não encontrado, usando .next diretamente"
sudo cp -r .next /var/www/manifold/ 2>/dev/null || true
sudo cp -r public /var/www/manifold/ 2>/dev/null || true

# Ajustar permissões
sudo chown -R www-data:www-data /var/www/manifold
sudo chmod -R 755 /var/www/manifold

echo -e "${GREEN}✅ Frontend movido${NC}"

#############################################
# Passo 9: Configurar Nginx
#############################################
echo -e "\n${GREEN}⚙️  Passo 9/9: Configurando Nginx...${NC}"

echo -e "${YELLOW}"
read -p "Digite seu domínio principal (ex: seudominio.com): " DOMAIN
read -p "Digite o subdomínio da API (ex: api.seudominio.com): " API_DOMAIN
echo -e "${NC}"

# Criar configuração Nginx
sudo tee /etc/nginx/sites-available/manifold > /dev/null << NGINX_EOF
# Backend API
server {
    listen 80;
    server_name ${API_DOMAIN};

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}

# Frontend
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};

    root /var/www/manifold;
    index index.html;

    location /_next/static {
        alias /var/www/manifold/.next/static;
        expires 1y;
        access_log off;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files \$uri \$uri.html \$uri/ =404;
    }

    # API proxy fallback
    location /api/ {
        proxy_pass http://localhost:8080/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX_EOF

# Ativar site
sudo ln -sf /etc/nginx/sites-available/manifold /etc/nginx/sites-enabled/

# Remover default
sudo rm -f /etc/nginx/sites-enabled/default

# Testar configuração
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

echo -e "${GREEN}✅ Nginx configurado${NC}"

#############################################
# Configurar SSL (opcional)
#############################################
echo -e "\n${YELLOW}🔒 Configurar SSL com Let's Encrypt?${NC}"
read -p "Deseja configurar SSL agora? (s/N): " SETUP_SSL

if [[ "$SETUP_SSL" =~ ^[Ss]$ ]]; then
    echo "Instalando Certbot..."
    sudo apt install -y certbot python3-certbot-nginx

    echo "Obtendo certificados SSL..."
    sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} -d ${API_DOMAIN}

    echo -e "${GREEN}✅ SSL configurado${NC}"
else
    echo -e "${YELLOW}⚠️  SSL não configurado. Execute manualmente depois:${NC}"
    echo "sudo apt install -y certbot python3-certbot-nginx"
    echo "sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} -d ${API_DOMAIN}"
fi

#############################################
# Configurar Firewall
#############################################
echo -e "\n${YELLOW}🔥 Configurar Firewall?${NC}"
read -p "Deseja configurar UFW firewall? (s/N): " SETUP_FW

if [[ "$SETUP_FW" =~ ^[Ss]$ ]]; then
    sudo ufw allow OpenSSH
    sudo ufw allow 'Nginx Full'
    sudo ufw --force enable
    sudo ufw status

    echo -e "${GREEN}✅ Firewall configurado${NC}"
fi

#############################################
# Finalizado
#############################################
echo -e "\n${GREEN}"
cat << "EOF"
╔════════════════════════════════════════╗
║        ✅ Setup Completo! 🎉           ║
╚════════════════════════════════════════╝
EOF
echo -e "${NC}"

echo -e "${BLUE}📊 Status dos Serviços:${NC}"
echo ""
echo "Backend (PM2):"
pm2 status
echo ""
echo "Nginx:"
sudo systemctl status nginx --no-pager | head -5
echo ""

echo -e "${BLUE}🌐 URLs:${NC}"
echo "Frontend: http://${DOMAIN}"
echo "API: http://${API_DOMAIN}/health"
echo ""

echo -e "${BLUE}🔧 Comandos Úteis:${NC}"
echo "Ver logs backend: pm2 logs manifold-backend-simple"
echo "Ver logs nginx: sudo tail -f /var/log/nginx/error.log"
echo "Reiniciar backend: pm2 restart manifold-backend-simple"
echo "Testar API: curl http://localhost:8080/health"
echo ""

echo -e "${YELLOW}📝 Próximos Passos:${NC}"
echo "1. Configurar DNS para apontar para este servidor"
echo "2. Testar acesso via navegador"
echo "3. Configurar SSL se não foi feito (recomendado)"
echo "4. Configurar database schema (ver HOSTINGER_DEPLOY.md)"
echo ""

echo -e "${GREEN}Documentação completa: HOSTINGER_DEPLOY.md${NC}"
