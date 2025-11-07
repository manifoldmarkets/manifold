#!/bin/bash

################################################################################
# Script de Setup Automatizado - VPS (Executar no seu computador local)
################################################################################
#
# Este script prepara e faz deploy da aplicação Manifold em um VPS
# Executa do SEU computador e conecta ao VPS via SSH
#
# Uso: ./setup-vps-local.sh
#
################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

log_step() {
    echo -e "${CYAN}[STEP]${NC} $1"
    echo ""
}

print_banner() {
    clear
    echo -e "${CYAN}"
    cat << "EOF"
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║            MANIFOLD MARKETS - SETUP VPS AUTOMATIZADO             ║
║                                                                   ║
║    Este script vai configurar seu VPS e fazer deploy do backend  ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    echo ""
}

check_local_requirements() {
    log_step "Verificando requisitos locais..."

    # Check SSH
    if ! command -v ssh &> /dev/null; then
        log_error "SSH não encontrado. Instale openssh-client"
        exit 1
    fi
    log_success "SSH disponível"

    # Check Git
    if ! command -v git &> /dev/null; then
        log_error "Git não encontrado. Instale git"
        exit 1
    fi
    log_success "Git disponível"

    echo ""
}

get_vps_info() {
    log_step "Informações do VPS"

    echo "Digite o IP do seu VPS:"
    read -p "IP: " VPS_IP

    echo ""
    echo "Digite o usuário SSH (geralmente 'root' ou 'deploy'):"
    read -p "Usuário: " VPS_USER

    echo ""
    echo "Tem SSH key configurado? (y/n)"
    read -p "SSH Key: " HAS_SSH_KEY

    if [ "$HAS_SSH_KEY" = "n" ]; then
        echo ""
        log_warning "É altamente recomendado usar SSH keys para segurança"
        echo "Vamos usar senha por enquanto, mas configure SSH keys depois"
        SSH_OPTS=""
    else
        echo ""
        echo "Caminho da chave SSH (Enter para ~/.ssh/id_rsa):"
        read -p "Chave: " SSH_KEY_PATH
        if [ -z "$SSH_KEY_PATH" ]; then
            SSH_KEY_PATH="$HOME/.ssh/id_rsa"
        fi
        SSH_OPTS="-i $SSH_KEY_PATH"
    fi

    echo ""
    log_info "Configuração:"
    echo "  VPS IP: $VPS_IP"
    echo "  Usuário: $VPS_USER"
    echo "  SSH Key: ${SSH_KEY_PATH:-Password}"
    echo ""

    read -p "Correto? (y/n): " CONFIRM
    if [ "$CONFIRM" != "y" ]; then
        echo "Setup cancelado"
        exit 0
    fi
    echo ""
}

test_ssh_connection() {
    log_step "Testando conexão SSH..."

    if ssh $SSH_OPTS -o ConnectTimeout=10 -o BatchMode=yes $VPS_USER@$VPS_IP "echo 'OK'" &> /dev/null; then
        log_success "Conexão SSH bem-sucedida!"
    else
        log_error "Não foi possível conectar ao VPS via SSH"
        echo ""
        echo "Tente conectar manualmente:"
        echo "  ssh $SSH_OPTS $VPS_USER@$VPS_IP"
        echo ""
        echo "Se funcionar, execute este script novamente"
        exit 1
    fi
    echo ""
}

get_credentials() {
    log_step "Credenciais da Aplicação"

    log_info "Vamos coletar as credenciais necessárias"
    echo ""

    # Supabase
    log_info "═══ SUPABASE (Database) ═══"
    echo ""
    read -p "Supabase Instance ID (ex: abcdefghij): " SUPABASE_INSTANCE_ID
    read -sp "Supabase Password (postgres): " SUPABASE_PASSWORD
    echo ""
    read -sp "Supabase API Key (anon): " SUPABASE_KEY
    echo ""
    read -sp "Supabase JWT Secret: " SUPABASE_JWT_SECRET
    echo ""

    # Firebase (opcional)
    echo ""
    read -p "Tem Firebase configurado? (y/n): " HAS_FIREBASE
    if [ "$HAS_FIREBASE" = "y" ]; then
        read -p "Firebase Project ID: " FIREBASE_PROJECT_ID
        log_info "Você precisará copiar firebase-service-account.json para o servidor depois"
    else
        FIREBASE_PROJECT_ID=""
    fi

    # Stripe (opcional)
    echo ""
    read -p "Tem Stripe configurado? (y/n): " HAS_STRIPE
    if [ "$HAS_STRIPE" = "y" ]; then
        read -sp "Stripe API Key: " STRIPE_APIKEY
        echo ""
        read -sp "Stripe Webhook Secret: " STRIPE_WEBHOOKSECRET
        echo ""
    else
        STRIPE_APIKEY=""
        STRIPE_WEBHOOKSECRET=""
    fi

    # Domínio (opcional)
    echo ""
    read -p "Tem domínio configurado? (y/n - pode configurar depois): " HAS_DOMAIN
    if [ "$HAS_DOMAIN" = "y" ]; then
        read -p "Domínio (ex: api.manifold.com): " DOMAIN
    else
        DOMAIN=""
        log_info "Vamos usar o IP do servidor por enquanto"
    fi

    echo ""
    log_success "Credenciais coletadas!"
    echo ""
}

create_env_file() {
    log_step "Criando arquivo .env..."

    cat > .env.tmp << EOF
# Environment
NODE_ENV=production
PORT=8088

# Supabase (Database)
SUPABASE_INSTANCE_ID=$SUPABASE_INSTANCE_ID
SUPABASE_PASSWORD=$SUPABASE_PASSWORD
SUPABASE_KEY=$SUPABASE_KEY
SUPABASE_JWT_SECRET=$SUPABASE_JWT_SECRET

# Firebase (Authentication)
${FIREBASE_PROJECT_ID:+GOOGLE_CLOUD_PROJECT=$FIREBASE_PROJECT_ID}
${FIREBASE_PROJECT_ID:+NEXT_PUBLIC_FIREBASE_ENV=PROD}

# Stripe (Payment Gateway)
${STRIPE_APIKEY:+STRIPE_APIKEY=$STRIPE_APIKEY}
${STRIPE_WEBHOOKSECRET:+STRIPE_WEBHOOKSECRET=$STRIPE_WEBHOOKSECRET}

# Add more credentials as needed
# GIDX_API_KEY=
# MAILGUN_KEY=
# TWILIO_ACCOUNT_SID=
# TWILIO_AUTH_TOKEN=
EOF

    log_success "Arquivo .env criado localmente"
    echo ""
}

install_server_software() {
    log_step "Instalando software no servidor..."

    log_info "Conectando ao VPS e instalando software necessário..."
    log_warning "Isso pode demorar 5-10 minutos..."
    echo ""

    ssh $SSH_OPTS $VPS_USER@$VPS_IP << 'ENDSSH'
set -e

echo "Atualizando sistema..."
sudo apt update && sudo apt upgrade -y

echo "Instalando ferramentas essenciais..."
sudo apt install -y git curl wget build-essential ufw

echo "Instalando Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

echo "Instalando Yarn..."
sudo npm install -g yarn

echo "Instalando PM2..."
sudo npm install -g pm2

echo "Instalando Nginx..."
sudo apt install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx

echo "Instalando Certbot (SSL)..."
sudo apt install -y certbot python3-certbot-nginx

echo "Configurando Firewall..."
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

echo "✓ Software instalado com sucesso!"
ENDSSH

    log_success "Software instalado no servidor!"
    echo ""
}

deploy_application() {
    log_step "Fazendo deploy da aplicação..."

    log_info "Clonando repositório..."

    # Get repo URL
    REPO_URL=$(git config --get remote.origin.url 2>/dev/null || echo "")
    if [ -z "$REPO_URL" ]; then
        echo "Digite a URL do repositório Git:"
        read -p "URL: " REPO_URL
    fi

    ssh $SSH_OPTS $VPS_USER@$VPS_IP << ENDSSH
set -e

echo "Criando diretório de aplicações..."
sudo mkdir -p /var/www
cd /var/www

echo "Clonando repositório..."
if [ -d "manifold" ]; then
    echo "Diretório já existe, fazendo pull..."
    cd manifold
    git pull
else
    sudo git clone $REPO_URL manifold
fi

echo "Ajustando permissões..."
sudo chown -R $VPS_USER:$VPS_USER /var/www/manifold

echo "Instalando dependências..."
cd /var/www/manifold
yarn install

echo "Building aplicação..."
cd backend/api
yarn build

echo "Criando diretório de logs..."
mkdir -p /var/www/manifold/logs

echo "✓ Deploy concluído!"
ENDSSH

    log_success "Aplicação deployada!"
    echo ""
}

setup_env_file() {
    log_step "Configurando variáveis de ambiente..."

    log_info "Copiando arquivo .env para o servidor..."

    scp $SSH_OPTS .env.tmp $VPS_USER@$VPS_IP:/tmp/.env

    ssh $SSH_OPTS $VPS_USER@$VPS_IP << 'ENDSSH'
set -e

sudo mv /tmp/.env /var/www/manifold/backend/api/.env
sudo chown $USER:$USER /var/www/manifold/backend/api/.env
sudo chmod 600 /var/www/manifold/backend/api/.env

echo "✓ Variáveis de ambiente configuradas!"
ENDSSH

    # Remove local temp file
    rm .env.tmp

    log_success "Arquivo .env configurado no servidor!"
    echo ""
}

configure_pm2() {
    log_step "Configurando PM2..."

    ssh $SSH_OPTS $VPS_USER@$VPS_IP << 'ENDSSH'
set -e

cd /var/www/manifold/backend/api

# Create PM2 ecosystem config
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'manifold-api',
      script: 'lib/serve.js',
      cwd: '/var/www/manifold/backend/api',
      instances: 4,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'production',
        PORT: 8088,
      },
      error_file: '/var/www/manifold/logs/err.log',
      out_file: '/var/www/manifold/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
EOF

echo "Iniciando aplicação com PM2..."
pm2 start ecosystem.config.js

echo "Salvando configuração PM2..."
pm2 save

echo "Configurando PM2 para iniciar no boot..."
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp /home/$USER

echo "✓ PM2 configurado!"
ENDSSH

    log_success "PM2 configurado e aplicação iniciada!"
    echo ""
}

configure_nginx() {
    log_step "Configurando Nginx..."

    SERVER_NAME=${DOMAIN:-$VPS_IP}

    ssh $SSH_OPTS $VPS_USER@$VPS_IP << ENDSSH
set -e

# Create Nginx config
sudo tee /etc/nginx/sites-available/manifold > /dev/null << 'EOF'
server {
    listen 80;
    server_name $SERVER_NAME;

    access_log /var/log/nginx/manifold-access.log;
    error_log /var/log/nginx/manifold-error.log;

    location / {
        proxy_pass http://localhost:8088;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location /ws {
        proxy_pass http://localhost:8088;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }

    client_max_body_size 10M;
}
EOF

# Enable site
sudo ln -sf /etc/nginx/sites-available/manifold /etc/nginx/sites-enabled/

# Test config
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

echo "✓ Nginx configurado!"
ENDSSH

    log_success "Nginx configurado!"
    echo ""
}

configure_ssl() {
    if [ -z "$DOMAIN" ]; then
        log_warning "Domínio não configurado, pulando SSL"
        log_info "Configure SSL mais tarde com:"
        echo "  sudo certbot --nginx -d seu-dominio.com"
        echo ""
        return
    fi

    log_step "Configurando SSL (HTTPS)..."

    read -p "Digite seu email para Let's Encrypt: " LETSENCRYPT_EMAIL

    ssh $SSH_OPTS $VPS_USER@$VPS_IP << ENDSSH
set -e

echo "Obtendo certificado SSL..."
sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email $LETSENCRYPT_EMAIL

echo "✓ SSL configurado!"
ENDSSH

    log_success "SSL configurado! Seu site está em HTTPS!"
    echo ""
}

print_summary() {
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║              SETUP CONCLUÍDO COM SUCESSO! 🎉                     ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    log_info "Sua aplicação está rodando!"
    echo ""

    if [ ! -z "$DOMAIN" ]; then
        echo "  ${CYAN}URL da aplicação:${NC}"
        echo "  ${BLUE}https://$DOMAIN${NC}"
    else
        echo "  ${CYAN}URL da aplicação:${NC}"
        echo "  ${BLUE}http://$VPS_IP${NC}"
    fi

    echo ""
    log_info "Comandos úteis:"
    echo ""
    echo "  ${CYAN}Conectar ao servidor:${NC}"
    echo "  ${BLUE}ssh $SSH_OPTS $VPS_USER@$VPS_IP${NC}"
    echo ""
    echo "  ${CYAN}Ver logs da aplicação:${NC}"
    echo "  ${BLUE}pm2 logs manifold-api${NC}"
    echo ""
    echo "  ${CYAN}Ver status:${NC}"
    echo "  ${BLUE}pm2 status${NC}"
    echo ""
    echo "  ${CYAN}Restart aplicação:${NC}"
    echo "  ${BLUE}pm2 restart manifold-api${NC}"
    echo ""
    echo "  ${CYAN}Ver logs Nginx:${NC}"
    echo "  ${BLUE}sudo tail -f /var/log/nginx/manifold-access.log${NC}"
    echo ""

    log_info "Próximos passos:"
    echo "  1. Testar a aplicação no navegador"
    echo "  2. Configurar monitoramento (UptimeRobot)"
    echo "  3. Configurar backups automáticos"
    echo "  4. Implementar Multicaixa Express"
    echo ""
}

################################################################################
# MAIN
################################################################################

print_banner
check_local_requirements
get_vps_info
test_ssh_connection
get_credentials
create_env_file
install_server_software
deploy_application
setup_env_file
configure_pm2
configure_nginx
configure_ssl
print_summary

log_success "✨ Tudo pronto! Sua aplicação está em produção!"
