# Guia Completo: Deploy em VPS Único

Este guia mostra como fazer deploy do backend Manifold em **um único servidor VPS** (DigitalOcean, Hostinger, Linode, etc.) sem precisar do Google Cloud Platform.

---

## 🎯 Visão Geral

**Tempo estimado**: 40-60 minutos
**Custo mensal**: $25-55 (vs $180-240 no GCP)
**Dificuldade**: Intermediária

### O que vamos fazer:
1. ✅ Criar um VPS (servidor virtual)
2. ✅ Instalar Node.js, PM2, Nginx
3. ✅ Configurar Supabase (database)
4. ✅ Fazer deploy do backend
5. ✅ Configurar SSL (HTTPS)
6. ✅ Configurar monitoramento básico

---

## 📋 Pré-requisitos

### 1. Conta em Provedor VPS

Escolha um (recomendado: **DigitalOcean**):
- [DigitalOcean](https://www.digitalocean.com/) - $48/mês, 8GB RAM
- [Linode](https://www.linode.com/) - $36/mês, 8GB RAM
- [Vultr](https://www.vultr.com/) - $48/mês, 8GB RAM
- [Hostinger](https://www.hostinger.com/) - $24/mês, 8GB RAM
- [Hetzner](https://www.hetzner.com/) - $15/mês, 8GB RAM

### 2. Conta Supabase (Database)

- Criar em: https://supabase.com
- Free tier disponível (até 500MB)
- Pro plan: $25/mês (8GB, recomendado para produção)

### 3. Domínio (Opcional mas recomendado)

- Qualquer registrar (Namecheap, GoDaddy, etc.)
- Para usar HTTPS com Let's Encrypt

### 4. Conhecimento Básico

- SSH e linha de comando Linux
- Conceitos básicos de servidor web

---

## 🚀 Passo a Passo

## PARTE 1: Criando o VPS

### DigitalOcean (Recomendado)

1. **Criar Conta**:
   - Acesse https://www.digitalocean.com/
   - Crie uma conta
   - Adicione forma de pagamento

2. **Criar Droplet**:
   ```
   Dashboard → Create → Droplets

   Choose Region:
   - Cape Town (África do Sul) - melhor para Angola
   - Frankfurt (Alemanha) - alternativa Europa

   Choose Image:
   - Ubuntu 22.04 LTS x64

   Choose Size:
   - Basic Plan
   - Regular Intel with SSD
   - 8GB RAM / 4 vCPU / 160GB SSD - $48/mês

   Authentication:
   - SSH Keys (recomendado) ou Password

   Hostname:
   - manifold-backend (ou qualquer nome)

   → Create Droplet
   ```

3. **Anotar IP do Servidor**:
   ```
   Exemplo: 165.227.45.123
   ```

### Hostinger VPS

1. **Criar Conta**: https://www.hostinger.com/vps-hosting

2. **Escolher Plano**:
   ```
   VPS 4:
   - 8GB RAM
   - 4 vCPU
   - 200GB Storage
   - $23.99/mês (anual)
   ```

3. **Configurar VPS**:
   ```
   OS: Ubuntu 22.04
   Location: Mais próximo de Angola (Europa)
   ```

4. **Anotar Credenciais**: IP, Username, Password

---

## PARTE 2: Configuração Inicial do Servidor

### 1. Conectar via SSH

```bash
# Substituir SEU_IP pelo IP do seu servidor
ssh root@SEU_IP

# Se usar SSH key:
ssh -i ~/.ssh/sua_chave root@SEU_IP
```

### 2. Atualizar Sistema

```bash
# Atualizar pacotes
apt update && apt upgrade -y

# Instalar ferramentas essenciais
apt install -y git curl wget build-essential ufw
```

### 3. Criar Usuário (Segurança)

```bash
# Criar usuário (não usar root para tudo)
adduser deploy
usermod -aG sudo deploy

# Configurar SSH para novo usuário
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# A partir de agora, usar:
# ssh deploy@SEU_IP
```

### 4. Configurar Firewall

```bash
# Habilitar firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Verificar status
ufw status
```

---

## PARTE 3: Instalar Software Necessário

### 1. Instalar Node.js 20

```bash
# Adicionar repositório NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Instalar Node.js
sudo apt install -y nodejs

# Verificar instalação
node --version  # Deve mostrar v20.x.x
npm --version
```

### 2. Instalar Yarn

```bash
npm install -g yarn

# Verificar
yarn --version
```

### 3. Instalar PM2 (Process Manager)

```bash
npm install -g pm2

# Verificar
pm2 --version
```

### 4. Instalar Nginx (Web Server / Reverse Proxy)

```bash
# Instalar Nginx
sudo apt install -y nginx

# Iniciar Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Verificar status
sudo systemctl status nginx

# Testar no navegador: http://SEU_IP
# Deve mostrar página padrão do Nginx
```

### 5. Instalar Certbot (SSL Certificates)

```bash
# Instalar Certbot
sudo apt install -y certbot python3-certbot-nginx

# Verificar
certbot --version
```

---

## PARTE 4: Configurar Supabase (Database)

### 1. Criar Projeto Supabase

1. Acesse https://supabase.com
2. Crie uma conta
3. Click "New Project"
4. Preencha:
   ```
   Name: manifold-backend
   Database Password: [Senha forte, anote!]
   Region: Closest to your VPS (ex: Europe West)
   Pricing Plan: Free (para testes) ou Pro ($25/mês)
   ```

5. Aguarde ~2 minutos (projeto sendo criado)

### 2. Obter Credenciais

No dashboard do projeto, vá em **Settings → API**:

Anote:
```
Project URL: https://XXXXX.supabase.co
API Key (anon key): eyJh....
Service Role Key: eyJh....

Database:
Host: db.XXXXX.supabase.co
Database name: postgres
Port: 5432
User: postgres
Password: [A senha que você criou]
```

### 3. Executar Migrations (Opcional)

Se você tiver migrations SQL:

```bash
# Instalar psql (cliente PostgreSQL)
sudo apt install -y postgresql-client

# Conectar ao banco
psql "postgresql://postgres:SUA_SENHA@db.XXXXX.supabase.co:5432/postgres"

# Dentro do psql, executar seus SQL files:
\i /caminho/para/migration.sql

# Sair
\q
```

Ou usar o **SQL Editor** no dashboard do Supabase (mais fácil).

---

## PARTE 5: Deploy da Aplicação

### 1. Clonar Repositório

```bash
# Ir para diretório de aplicações
cd /var/www

# Clonar repositório
sudo git clone https://github.com/SEU_USUARIO/manifold-PolyMarket-.git manifold

# Dar permissão ao usuário deploy
sudo chown -R deploy:deploy /var/www/manifold

# Entrar no diretório
cd /var/www/manifold
```

### 2. Instalar Dependências

```bash
# Instalar dependências de todo o projeto
yarn install

# Pode demorar 5-10 minutos
```

### 3. Configurar Variáveis de Ambiente

```bash
# Criar arquivo .env
cd /var/www/manifold/backend/api
nano .env
```

Adicione o seguinte conteúdo (ajuste com suas credenciais):

```bash
# Environment
NODE_ENV=production
PORT=8088

# Supabase (Database)
SUPABASE_INSTANCE_ID=seu-instance-id
SUPABASE_PASSWORD=sua-senha-postgres
SUPABASE_KEY=sua-anon-key
SUPABASE_JWT_SECRET=seu-jwt-secret

# Firebase (Authentication)
GOOGLE_CLOUD_PROJECT=seu-projeto-firebase
NEXT_PUBLIC_FIREBASE_ENV=PROD
# Colocar o arquivo firebase-service-account.json em /var/www/manifold/backend/

# Stripe (Payment Gateway)
STRIPE_APIKEY=sk_live_...
STRIPE_WEBHOOKSECRET=whsec_...

# GIDX (KYC - Opcional)
GIDX_API_KEY=sua-key
GIDX_MERCHANT_ID=seu-merchant-id
GIDX_PRODUCT_TYPE_ID=seu-product-id
GIDX_DEVICE_TYPE_ID=seu-device-id
GIDX_ACTIVITY_TYPE_ID=seu-activity-id

# Multicaixa Express (quando implementar)
MULTICAIXA_MERCHANT_ID=seu-merchant-id
MULTICAIXA_API_KEY=sua-api-key
MULTICAIXA_WEBHOOK_SECRET=seu-webhook-secret

# Email (Mailgun)
MAILGUN_KEY=sua-mailgun-key

# Outras configurações
TWILIO_ACCOUNT_SID=seu-twilio-sid
TWILIO_AUTH_TOKEN=seu-twilio-token
```

Salve e feche (Ctrl+O, Enter, Ctrl+X).

### 4. Build da Aplicação

```bash
# Ir para diretório da API
cd /var/www/manifold/backend/api

# Compilar TypeScript
yarn build

# Verificar se build foi bem-sucedido
ls -la lib/  # Deve ter arquivos .js
```

### 5. Configurar PM2

Edite o arquivo `ecosystem.config.js`:

```bash
nano /var/www/manifold/backend/api/ecosystem.config.js
```

Ajuste para VPS (arquivo simplificado):

```javascript
module.exports = {
  apps: [
    {
      name: 'manifold-api',
      script: 'lib/serve.js',
      cwd: '/var/www/manifold/backend/api',
      instances: 4,  // Número de CPUs
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
```

Criar diretório de logs:

```bash
mkdir -p /var/www/manifold/logs
```

### 6. Iniciar Aplicação com PM2

```bash
# Iniciar aplicação
pm2 start ecosystem.config.js

# Ver status
pm2 status

# Ver logs em tempo real
pm2 logs

# Configurar PM2 para iniciar no boot
pm2 startup
# Executar o comando que aparecer

pm2 save
```

### 7. Testar Aplicação

```bash
# Testar localmente
curl http://localhost:8088/

# Deve retornar algo (HTML ou JSON)
# Se retornar erro 502, verificar logs:
pm2 logs manifold-api
```

---

## PARTE 6: Configurar Nginx (Reverse Proxy)

### 1. Criar Configuração Nginx

```bash
sudo nano /etc/nginx/sites-available/manifold
```

Adicione:

```nginx
server {
    listen 80;
    server_name seu-dominio.com www.seu-dominio.com;
    # Se não tiver domínio ainda, use o IP:
    # server_name SEU_IP;

    # Logs
    access_log /var/log/nginx/manifold-access.log;
    error_log /var/log/nginx/manifold-error.log;

    # Proxy para aplicação Node.js
    location / {
        proxy_pass http://localhost:8088;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://localhost:8088;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Limit request size
    client_max_body_size 10M;
}
```

### 2. Habilitar Site

```bash
# Criar link simbólico
sudo ln -s /etc/nginx/sites-available/manifold /etc/nginx/sites-enabled/

# Testar configuração
sudo nginx -t

# Se OK, reload Nginx
sudo systemctl reload nginx
```

### 3. Testar

```bash
# No navegador, acesse:
http://seu-dominio.com
# ou
http://SEU_IP

# Deve mostrar a aplicação!
```

---

## PARTE 7: Configurar SSL (HTTPS)

### 1. Configurar DNS (se tiver domínio)

No painel do seu registrar de domínio:

```
Adicionar registro A:
Host: @
Value: SEU_IP_DO_VPS

Adicionar registro A (para www):
Host: www
Value: SEU_IP_DO_VPS

Aguardar propagação DNS (5-30 minutos)
```

### 2. Obter Certificado SSL (Let's Encrypt)

```bash
# Obter certificado (substitua seu-dominio.com)
sudo certbot --nginx -d seu-dominio.com -d www.seu-dominio.com

# Responda as perguntas:
# Email: seu-email@exemplo.com
# Aceitar termos: Yes
# Compartilhar email: No (opcional)
# Redirect HTTP to HTTPS: Yes
```

Certbot vai:
- Obter certificado SSL gratuito
- Configurar Nginx automaticamente
- Configurar renovação automática

### 3. Testar HTTPS

```bash
# No navegador:
https://seu-dominio.com

# Deve ter cadeado verde!
```

### 4. Configurar Renovação Automática

```bash
# Testar renovação (dry-run)
sudo certbot renew --dry-run

# Se OK, está configurado!
# Certbot vai renovar automaticamente antes de expirar (90 dias)
```

---

## PARTE 8: Configurar Scheduler (Tarefas Agendadas)

Se sua aplicação precisa do Scheduler:

```bash
# Ir para diretório do scheduler
cd /var/www/manifold/backend/scheduler

# Build
yarn build

# Criar config PM2
nano ecosystem.config.js
```

```javascript
module.exports = {
  apps: [
    {
      name: 'manifold-scheduler',
      script: 'lib/index.js',
      cwd: '/var/www/manifold/backend/scheduler',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 8080,
      },
    },
  ],
};
```

```bash
# Iniciar scheduler
pm2 start ecosystem.config.js

# Salvar
pm2 save
```

---

## PARTE 9: Monitoramento e Logs

### 1. PM2 Monitoring

```bash
# Dashboard do PM2
pm2 monit

# Ver logs
pm2 logs

# Ver logs de app específico
pm2 logs manifold-api

# Limpar logs
pm2 flush
```

### 2. Logs do Nginx

```bash
# Ver logs de acesso
sudo tail -f /var/log/nginx/manifold-access.log

# Ver logs de erro
sudo tail -f /var/log/nginx/manifold-error.log
```

### 3. Configurar UptimeRobot (Monitoring Externo)

1. Criar conta: https://uptimerobot.com (Free)
2. Add New Monitor:
   ```
   Monitor Type: HTTP(s)
   Friendly Name: Manifold Backend
   URL: https://seu-dominio.com/health
   Monitoring Interval: 5 minutes
   Alert Contacts: Seu email
   ```

### 4. Configurar Logs Rotation

```bash
# Criar arquivo de configuração
sudo nano /etc/logrotate.d/manifold
```

```
/var/www/manifold/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 deploy deploy
    sharedscripts
}
```

---

## PARTE 10: Backup e Disaster Recovery

### 1. Snapshot do VPS

**DigitalOcean**:
```
Dashboard → Droplets → Seu Droplet → Snapshots
→ Take Snapshot

Habilitar Backups Automáticos:
→ Enable Backups ($6.72/mês extra)
```

### 2. Backup de Arquivos

```bash
# Criar script de backup
sudo nano /usr/local/bin/backup-manifold.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/manifold"
DATE=$(date +%Y%m%d_%H%M%S)

# Criar diretório
mkdir -p $BACKUP_DIR

# Backup .env
cp /var/www/manifold/backend/api/.env $BACKUP_DIR/.env_$DATE

# Backup logs
tar -czf $BACKUP_DIR/logs_$DATE.tar.gz /var/www/manifold/logs

# Manter apenas últimos 7 dias
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
```

```bash
# Tornar executável
sudo chmod +x /usr/local/bin/backup-manifold.sh

# Agendar com cron (diário às 2 AM)
sudo crontab -e

# Adicionar linha:
0 2 * * * /usr/local/bin/backup-manifold.sh >> /var/log/backup-manifold.log 2>&1
```

### 3. Backup do Supabase

No dashboard do Supabase:
```
Settings → Database → Backups
→ Automated Backups (Pro plan)

Ou fazer backup manual:
→ Download Backup
```

---

## PARTE 11: Segurança

### 1. Desabilitar Login Root via SSH

```bash
sudo nano /etc/ssh/sshd_config
```

Encontrar e modificar:
```
PermitRootLogin no
PasswordAuthentication no  # Se usar SSH keys
```

```bash
# Reiniciar SSH
sudo systemctl restart sshd
```

### 2. Instalar Fail2Ban (Proteção contra Brute Force)

```bash
# Instalar
sudo apt install -y fail2ban

# Configurar
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo nano /etc/fail2ban/jail.local
```

Encontrar seção `[sshd]` e modificar:
```
[sshd]
enabled = true
port = ssh
maxretry = 3
bantime = 3600
```

```bash
# Reiniciar
sudo systemctl enable fail2ban
sudo systemctl restart fail2ban

# Ver status
sudo fail2ban-client status sshd
```

### 3. Configurar Rate Limiting no Nginx

```bash
sudo nano /etc/nginx/nginx.conf
```

Adicionar dentro de `http {`:
```nginx
# Rate limiting
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_status 429;
```

No arquivo do site (`/etc/nginx/sites-available/manifold`):
```nginx
location /v0/ {
    limit_req zone=api burst=20 nodelay;
    proxy_pass http://localhost:8088;
    # ... resto da configuração
}
```

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## PARTE 12: Deploy Futuro (Updates)

### Script de Deploy Rápido

```bash
# Criar script
nano /home/deploy/deploy.sh
```

```bash
#!/bin/bash
set -e

echo "🚀 Iniciando deploy..."

# Ir para diretório
cd /var/www/manifold

# Pull latest code
git pull origin main

# Instalar dependências
yarn install

# Build
cd backend/api
yarn build

# Restart com PM2
pm2 restart manifold-api

echo "✅ Deploy concluído!"
pm2 status
```

```bash
chmod +x /home/deploy/deploy.sh

# Usar:
./deploy.sh
```

---

## 📊 Checklist Pós-Deploy

- [ ] VPS criado e acessível via SSH
- [ ] Node.js 20+ instalado
- [ ] PM2 instalado e configurado
- [ ] Nginx instalado e configurado
- [ ] Supabase configurado
- [ ] Aplicação clonada e dependencies instaladas
- [ ] .env configurado com todas as credenciais
- [ ] Build bem-sucedido
- [ ] PM2 rodando aplicação
- [ ] Nginx proxy funcionando
- [ ] SSL configurado (HTTPS)
- [ ] Firewall configurado
- [ ] Monitoramento configurado
- [ ] Backup configurado
- [ ] Domínio apontando para servidor (se aplicável)
- [ ] Aplicação acessível via browser
- [ ] Logs sem erros críticos

---

## 🆘 Troubleshooting

### Aplicação não inicia

```bash
# Ver logs do PM2
pm2 logs manifold-api

# Ver erros específicos
pm2 logs manifold-api --err

# Restart
pm2 restart manifold-api

# Se não resolver, start manualmente para ver erro:
cd /var/www/manifold/backend/api
node lib/serve.js
```

### Nginx 502 Bad Gateway

```bash
# Verificar se aplicação está rodando
pm2 status

# Verificar se porta 8088 está listening
sudo netstat -tlnp | grep 8088

# Ver logs Nginx
sudo tail -f /var/log/nginx/manifold-error.log

# Testar conexão local
curl http://localhost:8088
```

### SSL não funciona

```bash
# Verificar certificado
sudo certbot certificates

# Renovar manualmente
sudo certbot renew

# Ver logs
sudo tail -f /var/log/letsencrypt/letsencrypt.log
```

### Aplicação fica sem memória

```bash
# Ver uso de memória
pm2 monit

# Aumentar max_memory_restart no ecosystem.config.js
# Ou upgrade do VPS para mais RAM
```

---

## 💰 Custos Mensais Estimados

```
VPS (DigitalOcean 8GB):        $48/mês
Backups automáticos:           $7/mês
Supabase Pro:                  $25/mês
Domínio (.com):                $12/ano = $1/mês
──────────────────────────────────────
TOTAL:                         ~$81/mês

vs GCP:                        ~$200/mês
ECONOMIA:                      60%!
```

---

## 🎯 Próximos Passos

1. **Implementar Multicaixa Express**
   - Adicionar endpoints de depósito/saque AOA
   - Integrar com gateway Multicaixa
   - Testar fluxo de pagamento

2. **Configurar CI/CD**
   - GitHub Actions para deploy automático
   - Testes automatizados

3. **Otimizações**
   - Redis para caching
   - Cloudflare CDN
   - Database query optimization

4. **Scaling**
   - Upgrade de VPS quando necessário
   - Considerar múltiplos servidores (futuro)

---

**Pronto! Seu backend está rodando em produção!** 🎉
