# Deploy Completo no Hostinger VPS

**Frontend (Next.js) + Backend (Express) no mesmo servidor**

---

## 📋 Pré-requisitos

### O que você precisa:
- ✅ VPS Hostinger (plano que você já tem)
- ✅ Acesso SSH ao VPS
- ✅ Domínio apontando para o VPS
- ✅ Credenciais Firebase
- ✅ Database PostgreSQL (Supabase recomendado)

---

## 🏗️ Arquitetura no Hostinger

```
┌─────────────────────────────────────────┐
│         Hostinger VPS                   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │          Nginx                  │   │
│  │  (Reverse Proxy + Static)       │   │
│  └────┬─────────────────────┬──────┘   │
│       │                     │          │
│       ↓                     ↓          │
│  ┌─────────┐         ┌──────────┐     │
│  │ Backend │         │ Frontend │     │
│  │ Express │         │ Next.js  │     │
│  │ :8080   │         │ (static) │     │
│  │  PM2    │         │   /var   │     │
│  └─────────┘         └──────────┘     │
│                                         │
│  api.seudominio.com  →  Backend        │
│  seudominio.com      →  Frontend       │
└─────────────────────────────────────────┘
```

---

## 🚀 Passo 1: Preparar o VPS Hostinger

### 1.1. Conectar via SSH

```bash
# Obtenha o IP do seu VPS no painel Hostinger
ssh root@SEU_IP_HOSTINGER

# Ou se tiver usuário diferente:
ssh usuario@SEU_IP_HOSTINGER
```

### 1.2. Atualizar Sistema

```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y

# Instalar ferramentas básicas
sudo apt install -y curl git build-essential
```

### 1.3. Instalar Node.js 20

```bash
# Adicionar repositório NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Instalar Node.js
sudo apt install -y nodejs

# Verificar instalação
node --version  # Deve mostrar v20.x.x
npm --version
```

### 1.4. Instalar PM2

```bash
sudo npm install -g pm2

# Verificar
pm2 --version
```

### 1.5. Instalar Nginx

```bash
sudo apt install -y nginx

# Iniciar e habilitar
sudo systemctl start nginx
sudo systemctl enable nginx

# Verificar
sudo systemctl status nginx
```

---

## 📦 Passo 2: Deploy do Backend

### 2.1. Clonar Repositório

```bash
# Ir para diretório home
cd ~

# Clonar repositório
git clone https://github.com/SEU_ORG/manifold-PolyMarket-.git
cd manifold-PolyMarket-

# Checkout do branch correto
git checkout claude/backend-production-readiness-review-011CUqb9EBaeZWkKWNsoKgDN
```

### 2.2. Configurar Backend

```bash
# Ir para pasta do backend
cd backend-simple/api

# Instalar dependências
npm install --production

# Criar arquivo .env
nano .env
```

**Conteúdo do `.env`:**
```env
# Server
PORT=8080
NODE_ENV=production

# Firebase Admin SDK
FIREBASE_PROJECT_ID=seu-project-id
FIREBASE_CLIENT_EMAIL=seu-service-account@project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
...sua-chave-privada-aqui...
-----END PRIVATE KEY-----"

# Database (Supabase)
DATABASE_URL=postgresql://user:password@host:5432/database
SUPABASE_KEY=sua-supabase-anon-key
SUPABASE_URL=https://seu-projeto.supabase.co

# App Config
STARTING_BALANCE=1000
SIGNUP_BONUS=1000
MIN_BET=1
```

Salvar: `Ctrl+O`, Enter, `Ctrl+X`

### 2.3. Build Backend

```bash
# Compilar TypeScript
npm run build

# Verificar build
ls -la dist/
```

### 2.4. Configurar Database

```bash
# Conectar ao Supabase e executar schema
# (Ou via Supabase Dashboard SQL Editor)
psql $DATABASE_URL -f ../supabase/schema.sql
```

### 2.5. Iniciar Backend com PM2

```bash
# Criar diretório de logs
mkdir -p logs

# Iniciar com PM2
pm2 start ecosystem.config.js --env production

# Verificar status
pm2 status
pm2 logs manifold-backend-simple

# Salvar configuração PM2
pm2 save

# Auto-start no boot
pm2 startup
# Copiar e executar o comando que aparecer
```

### 2.6. Testar Backend

```bash
# Teste local
curl http://localhost:8080/health

# Deve retornar: {"status":"ok",...}
```

---

## 🎨 Passo 3: Deploy do Frontend (Next.js)

### 3.1. Ir para pasta Web

```bash
cd ~/manifold-PolyMarket-/web
```

### 3.2. Configurar Environment Variables

```bash
# Criar .env.local
nano .env.local
```

**Conteúdo do `.env.local`:**
```env
# API Backend
NEXT_PUBLIC_API_URL=https://api.seudominio.com

# Firebase (Frontend)
NEXT_PUBLIC_FIREBASE_API_KEY=sua-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=seu-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=seu-projeto.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123

# Supabase (Frontend)
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_KEY=sua-supabase-anon-key

# Environment
NEXT_PUBLIC_ENV=production
```

Salvar: `Ctrl+O`, Enter, `Ctrl+X`

### 3.3. Instalar Dependências e Build

```bash
# Instalar dependências
npm install --production

# Build estático do Next.js
npm run build

# Exportar estático (se usar next export)
# npm run export

# Verificar build
ls -la .next/
```

### 3.4. Mover Build para /var/www

```bash
# Criar diretório
sudo mkdir -p /var/www/manifold

# Copiar build
sudo cp -r .next/standalone/* /var/www/manifold/ 2>/dev/null || true
sudo cp -r .next/static /var/www/manifold/.next/
sudo cp -r public /var/www/manifold/

# Ajustar permissões
sudo chown -R www-data:www-data /var/www/manifold
sudo chmod -R 755 /var/www/manifold
```

**Alternativa: Servir Next.js com PM2**

Se preferir rodar Next.js como servidor Node:

```bash
# Voltar para pasta web
cd ~/manifold-PolyMarket-/web

# Criar ecosystem PM2 para frontend
cat > ecosystem.frontend.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'manifold-frontend',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -p 3000',
    cwd: '/root/manifold-PolyMarket-/web',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
}
EOF

# Iniciar
pm2 start ecosystem.frontend.config.js
pm2 save
```

---

## ⚙️ Passo 4: Configurar Nginx

### 4.1. Criar Configuração Nginx

```bash
sudo nano /etc/nginx/sites-available/manifold
```

**Opção A: Frontend Estático + Backend API**

```nginx
# Backend API
server {
    listen 80;
    server_name api.seudominio.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Frontend (Static Next.js)
server {
    listen 80;
    server_name seudominio.com www.seudominio.com;

    root /var/www/manifold;
    index index.html;

    location /_next/static {
        alias /var/www/manifold/.next/static;
        expires 1y;
        access_log off;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri.html $uri/ =404;
    }

    # API proxy (se precisar)
    location /api/ {
        proxy_pass http://localhost:8080/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Opção B: Frontend com Next.js Server (PM2) + Backend API**

```nginx
# Backend API
server {
    listen 80;
    server_name api.seudominio.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Frontend (Next.js Server)
server {
    listen 80;
    server_name seudominio.com www.seudominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Salvar: `Ctrl+O`, Enter, `Ctrl+X`

### 4.2. Ativar Site

```bash
# Criar symlink
sudo ln -s /etc/nginx/sites-available/manifold /etc/nginx/sites-enabled/

# Remover default (opcional)
sudo rm /etc/nginx/sites-enabled/default

# Testar configuração
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

---

## 🔒 Passo 5: Configurar SSL (Let's Encrypt)

### 5.1. Instalar Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 5.2. Obter Certificados SSL

```bash
# Para ambos os domínios
sudo certbot --nginx -d seudominio.com -d www.seudominio.com -d api.seudominio.com

# Seguir instruções:
# 1. Inserir email
# 2. Aceitar termos
# 3. Escolher opção 2 (Redirect HTTP para HTTPS)
```

### 5.3. Testar Renovação Automática

```bash
# Teste dry-run
sudo certbot renew --dry-run

# Certbot cria cron job automático em:
# /etc/cron.d/certbot
```

---

## 🔥 Passo 6: Configurar Firewall

```bash
# Permitir SSH
sudo ufw allow OpenSSH

# Permitir HTTP e HTTPS
sudo ufw allow 'Nginx Full'

# Ativar firewall
sudo ufw enable

# Verificar status
sudo ufw status
```

---

## ✅ Passo 7: Verificar Deployment

### 7.1. Testar Backend

```bash
# Via curl
curl https://api.seudominio.com/health

# Deve retornar: {"status":"ok",...}
```

### 7.2. Testar Frontend

```bash
# Abrir no navegador
https://seudominio.com

# Deve carregar a página inicial do Manifold
```

### 7.3. Verificar PM2

```bash
pm2 status
pm2 logs

# Ver processos
ps aux | grep node
```

### 7.4. Verificar Nginx

```bash
sudo systemctl status nginx

# Ver logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

## 🔄 Passo 8: Script de Deploy Automático

Crie um script para deploy rápido:

```bash
nano ~/deploy.sh
```

**Conteúdo:**
```bash
#!/bin/bash

echo "🚀 Deploying Manifold to Hostinger VPS..."

# Cores
GREEN='\033[0;32m'
NC='\033[0m'

# 1. Pull latest code
cd ~/manifold-PolyMarket-
git pull origin claude/backend-production-readiness-review-011CUqb9EBaeZWkKWNsoKgDN

# 2. Deploy Backend
echo -e "${GREEN}📦 Deploying Backend...${NC}"
cd backend-simple/api
npm install --production
npm run build
pm2 restart manifold-backend-simple

# 3. Deploy Frontend
echo -e "${GREEN}🎨 Deploying Frontend...${NC}"
cd ~/manifold-PolyMarket-/web
npm install --production
npm run build

# Opção A: Static
sudo cp -r .next/static /var/www/manifold/.next/ 2>/dev/null || true
sudo cp -r public /var/www/manifold/ 2>/dev/null || true

# Opção B: Next.js Server
# pm2 restart manifold-frontend

# 4. Reload Nginx
sudo systemctl reload nginx

echo -e "${GREEN}✅ Deploy completed!${NC}"
pm2 status
```

Tornar executável:
```bash
chmod +x ~/deploy.sh
```

Usar:
```bash
~/deploy.sh
```

---

## 📊 Passo 9: Monitoramento

### 9.1. PM2 Monitoring

```bash
# Dashboard em tempo real
pm2 monit

# Ver logs
pm2 logs manifold-backend-simple --lines 100

# Ver informações
pm2 info manifold-backend-simple
```

### 9.2. Nginx Logs

```bash
# Access log
sudo tail -f /var/log/nginx/access.log

# Error log
sudo tail -f /var/log/nginx/error.log
```

### 9.3. System Resources

```bash
# CPU e Memória
htop

# Disk space
df -h

# Processos Node
ps aux | grep node
```

---

## 🛠️ Troubleshooting

### Problema: "502 Bad Gateway"

**Solução:**
```bash
# Verificar se backend está rodando
pm2 status
pm2 logs

# Reiniciar backend
pm2 restart manifold-backend-simple

# Verificar porta
sudo netstat -tulpn | grep :8080
```

### Problema: "Cannot connect to database"

**Solução:**
```bash
# Testar conexão
psql $DATABASE_URL -c "SELECT 1"

# Verificar .env
cat ~/manifold-PolyMarket-/backend-simple/api/.env

# Verificar firewall Supabase
# Adicionar IP do VPS nas configurações Supabase
```

### Problema: Frontend não carrega

**Solução:**
```bash
# Verificar build
cd ~/manifold-PolyMarket-/web
ls -la .next/

# Verificar Nginx
sudo nginx -t
sudo systemctl status nginx

# Ver logs
sudo tail -f /var/log/nginx/error.log
```

### Problema: PM2 não inicia no boot

**Solução:**
```bash
# Remover startup antigo
pm2 unstartup

# Criar novo
pm2 startup

# Salvar processos
pm2 save
```

---

## 💰 Custos Estimados (Hostinger)

| Item | Custo Mensal |
|------|--------------|
| **VPS Hostinger** | $10-30 (plano básico) |
| **Supabase** | $0-25 (Free tier ou Pro) |
| **Firebase** | $0 (Free tier suficiente) |
| **Domínio** | $1-2/mês |
| **Total** | **$11-57/mês** |

**vs Vercel + Backend separado:**
- Vercel Pro: $20/mês
- Backend VPS: $25-50/mês
- Total: $45-70/mês

**Economia: 15-35% com Hostinger!** 💰

---

## 📚 Comandos Úteis

### Deploy
```bash
~/deploy.sh                          # Deploy completo
```

### PM2
```bash
pm2 status                           # Status dos processos
pm2 logs                             # Ver logs
pm2 restart all                      # Reiniciar tudo
pm2 stop all                         # Parar tudo
pm2 delete all                       # Remover tudo
```

### Nginx
```bash
sudo nginx -t                        # Testar config
sudo systemctl reload nginx          # Reload
sudo systemctl restart nginx         # Restart
```

### Git
```bash
cd ~/manifold-PolyMarket-
git pull                             # Atualizar código
git status                           # Ver mudanças
```

### SSL
```bash
sudo certbot renew                   # Renovar certs
sudo certbot certificates            # Ver certs
```

---

## ✅ Checklist Final

- [ ] VPS Hostinger configurado
- [ ] Node.js 20 instalado
- [ ] PM2 instalado
- [ ] Nginx instalado
- [ ] Backend rodando em :8080
- [ ] Frontend buildado
- [ ] Nginx configurado
- [ ] SSL ativado (HTTPS)
- [ ] Firewall configurado
- [ ] PM2 auto-start configurado
- [ ] Script de deploy criado
- [ ] Domínio apontando corretamente
- [ ] Testes passando (backend + frontend)

---

## 🎉 Sucesso!

Agora você tem:
- ✅ Frontend (Next.js) + Backend (Express) no mesmo VPS
- ✅ HTTPS com Let's Encrypt
- ✅ PM2 gerenciando processos
- ✅ Nginx como reverse proxy
- ✅ Deploy automático com script
- ✅ Custo: $11-57/mês (vs $70+ com Vercel)

**Pronto para produção!** 🚀

---

**Última atualização:** 2025-11-07
**Testado em:** Ubuntu 20.04/22.04 LTS
