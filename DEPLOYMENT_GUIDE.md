# Guia de Deploy do Backend no GCP

Este guia completo explica como fazer deploy do backend Manifold Markets no Google Cloud Platform (GCP).

## 📋 Pré-requisitos

### 1. Software Necessário

```bash
# Verificar Node.js (versão 20+)
node --version

# Verificar Yarn
yarn --version

# Verificar Docker
docker --version

# Verificar gcloud CLI
gcloud --version
```

**Instalar se necessário:**

```bash
# Node.js 20+
# Ubuntu/Debian:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Yarn
npm install -g yarn

# Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# Logout e login novamente para aplicar grupo docker

# Google Cloud SDK
curl https://sdk.cloud.google.com | bash
exec -l $SHELL  # Reiniciar shell
```

### 2. Configuração do GCP

#### 2.1. Criar/Configurar Projeto GCP

```bash
# Login no GCP
gcloud auth login

# Listar projetos existentes
gcloud projects list

# Criar novo projeto (se necessário)
gcloud projects create dev-manifold-ao --name="Manifold Angola Dev"

# Definir projeto padrão
gcloud config set project dev-manifold-ao
```

#### 2.2. Habilitar APIs Necessárias

```bash
PROJECT_ID="dev-manifold-ao"

# Habilitar APIs essenciais
gcloud services enable compute.googleapis.com \
  --project=${PROJECT_ID}

gcloud services enable container.googleapis.com \
  --project=${PROJECT_ID}

gcloud services enable cloudbuild.googleapis.com \
  --project=${PROJECT_ID}

gcloud services enable artifactregistry.googleapis.com \
  --project=${PROJECT_ID}

gcloud services enable secretmanager.googleapis.com \
  --project=${PROJECT_ID}

gcloud services enable run.googleapis.com \
  --project=${PROJECT_ID}
```

#### 2.3. Configurar Docker para GCP

```bash
# Autenticar Docker com Artifact Registry
gcloud auth configure-docker us-east4-docker.pkg.dev

# Criar Artifact Registry (se não existir)
gcloud artifacts repositories create builds \
  --repository-format=docker \
  --location=us-east4 \
  --description="Docker images for Manifold" \
  --project=${PROJECT_ID}
```

### 3. Configuração do Supabase (Database)

#### 3.1. Criar Conta Supabase

1. Acesse https://supabase.com
2. Crie uma conta
3. Crie um novo projeto
4. Guarde as credenciais:
   - `SUPABASE_INSTANCE_ID` (ex: `abcdefghijklmnop`)
   - `SUPABASE_PASSWORD` (senha do postgres)
   - `SUPABASE_KEY` (anon/service key)
   - `SUPABASE_JWT_SECRET`

#### 3.2. Executar Migrations SQL

```bash
# Se você tiver arquivos de migration
cd /path/to/manifold-PolyMarket-/backend

# Conectar ao Supabase e executar migrations
# (Isso pode ser feito via Supabase Dashboard > SQL Editor)
```

### 4. Configurar Secrets no GCP

```bash
PROJECT_ID="dev-manifold-ao"

# Firebase Admin SDK
gcloud secrets create FIREBASE_SERVICE_ACCOUNT \
  --data-file=./firebase-service-account.json \
  --project=${PROJECT_ID}

# Supabase
echo -n "sua-supabase-key-aqui" | gcloud secrets create SUPABASE_KEY \
  --data-file=- \
  --project=${PROJECT_ID}

echo -n "sua-supabase-password-aqui" | gcloud secrets create SUPABASE_PASSWORD \
  --data-file=- \
  --project=${PROJECT_ID}

echo -n "sua-supabase-jwt-secret-aqui" | gcloud secrets create SUPABASE_JWT_SECRET \
  --data-file=- \
  --project=${PROJECT_ID}

# Stripe
echo -n "sua-stripe-api-key-aqui" | gcloud secrets create STRIPE_APIKEY \
  --data-file=- \
  --project=${PROJECT_ID}

echo -n "seu-stripe-webhook-secret-aqui" | gcloud secrets create STRIPE_WEBHOOKSECRET \
  --data-file=- \
  --project=${PROJECT_ID}

# GIDX (se usar)
echo -n "sua-gidx-api-key-aqui" | gcloud secrets create GIDX_API_KEY \
  --data-file=- \
  --project=${PROJECT_ID}

# ... outros secrets conforme necessário
```

### 5. Configurar Variáveis de Ambiente Locais

Crie um arquivo `.env` na raiz do projeto:

```bash
# .env
GOOGLE_CLOUD_PROJECT=dev-manifold-ao
NEXT_PUBLIC_FIREBASE_ENV=DEV

# Supabase
SUPABASE_INSTANCE_ID=abcdefghijklmnop
SUPABASE_PASSWORD=sua-senha-aqui
SUPABASE_KEY=sua-key-aqui
SUPABASE_JWT_SECRET=seu-jwt-secret-aqui

# Firebase
FIREBASE_PROJECT_ID=dev-manifold-ao

# Stripe
STRIPE_APIKEY=sk_test_...
STRIPE_WEBHOOKSECRET=whsec_...

# GIDX
GIDX_API_KEY=sua-key-aqui
GIDX_MERCHANT_ID=seu-merchant-id
GIDX_PRODUCT_TYPE_ID=seu-product-type-id
GIDX_DEVICE_TYPE_ID=seu-device-type-id
GIDX_ACTIVITY_TYPE_ID=seu-activity-type-id
```

---

## 🚀 Deploy do Backend

### Opção 1: Deploy da API (Compute Engine)

#### 1.1. Build Local

```bash
cd backend/api

# Instalar dependências
yarn install

# Build do projeto
yarn build

# Verificar se build foi bem-sucedido
ls -la dist/
```

#### 1.2. Deploy para DEV

```bash
cd backend/api

# Deploy para ambiente de desenvolvimento
./deploy-api.sh dev
```

**O que acontece:**
1. Build do código TypeScript
2. Criação de imagem Docker
3. Push para Artifact Registry
4. Criação de instance template no GCP
5. Update do Managed Instance Group
6. Rolling update (zero-downtime)

#### 1.3. Deploy para PROD

```bash
cd backend/api

# Deploy para ambiente de produção
./deploy-api.sh prod
```

**Configurações:**
- **DEV**:
  - Machine type: `e2-small` (2 vCPU, 2GB RAM)
  - Project: `dev-mantic-markets`
  - Region: `us-east4` (Virgínia)

- **PROD**:
  - Machine type: `c2-standard-4` (4 vCPU, 16GB RAM)
  - Project: `mantic-markets`
  - PM2 clustering: 1 main + 3 read replicas

### Opção 2: Deploy do Scheduler (Compute Engine)

```bash
cd backend/scheduler

# Deploy scheduler para DEV
./deploy-scheduler.sh dev

# Ou para PROD
./deploy-scheduler.sh prod
```

### Opção 3: Deploy do Discord Bot (Cloud Run)

```bash
cd backend/discord-bot

# Deploy para DEV
./deploy.sh dev

# Ou para PROD
./deploy.sh prod
```

---

## 🔍 Verificação do Deploy

### 1. Verificar Instances

```bash
# Listar todas as instâncias
gcloud compute instances list --project=dev-manifold-ao

# Ver logs da API
gcloud compute instances get-serial-port-output api-XXXXX \
  --project=dev-manifold-ao \
  --zone=us-east4-a
```

### 2. Verificar Status do Service

```bash
# Ver status do Managed Instance Group
gcloud compute instance-groups managed describe api-group-east \
  --zone=us-east4-a \
  --project=dev-manifold-ao

# Verificar saúde das instâncias
gcloud compute backend-services get-health api-backend-service \
  --global \
  --project=dev-manifold-ao
```

### 3. Testar API

```bash
# Obter IP externo da API
API_IP=$(gcloud compute instances list \
  --project=dev-manifold-ao \
  --filter="name~'^api-'" \
  --format="value(networkInterfaces[0].accessConfigs[0].natIP)")

echo "API IP: ${API_IP}"

# Testar health check (se houver)
curl http://${API_IP}/health

# Testar endpoint básico
curl http://${API_IP}/v0/health
```

### 4. Ver Logs em Tempo Real

```bash
# Logs da API via SSH
gcloud compute ssh api-XXXXX \
  --project=dev-manifold-ao \
  --zone=us-east4-a \
  --command="sudo docker logs -f $(sudo docker ps -q)"

# Ou via Cloud Logging
gcloud logging read "resource.type=gce_instance AND resource.labels.instance_id=INSTANCE_ID" \
  --limit 50 \
  --format json \
  --project=dev-manifold-ao
```

---

## 🔧 Troubleshooting

### Problema: Docker não está instalado

```bash
# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Logout e login novamente
```

### Problema: Erro de autenticação Docker

```bash
# Reautenticar
gcloud auth login
gcloud auth configure-docker us-east4-docker.pkg.dev
```

### Problema: Build falha com erro de TypeScript

```bash
# Limpar node_modules e reinstalar
cd backend/api
rm -rf node_modules
rm -rf ../../common/node_modules
rm -rf ../shared/node_modules
yarn install

# Rebuild
yarn build
```

### Problema: Instance não fica healthy

```bash
# SSH na instância e verificar logs do Docker
gcloud compute ssh api-XXXXX \
  --project=dev-manifold-ao \
  --zone=us-east4-a

# Dentro da VM:
sudo docker ps -a
sudo docker logs $(sudo docker ps -q)
```

### Problema: Secrets não estão disponíveis

```bash
# Verificar se secrets existem
gcloud secrets list --project=dev-manifold-ao

# Verificar permissões
gcloud projects get-iam-policy dev-manifold-ao

# Dar acesso de Secret Accessor para Compute Engine
gcloud projects add-iam-policy-binding dev-manifold-ao \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 📊 Monitoramento

### 1. Dashboard do GCP

```bash
# Abrir console do GCP
echo "https://console.cloud.google.com/compute/instances?project=dev-manifold-ao"
```

### 2. Métricas

- **CPU Usage**: Monitorar uso de CPU das instâncias
- **Memory Usage**: Monitorar uso de memória
- **Network Traffic**: Monitorar tráfego de rede
- **Request Count**: Monitorar número de requisições
- **Error Rate**: Monitorar taxa de erro 5xx

### 3. Alertas

Configure alertas no GCP Monitoring:

```bash
# Criar alerta de CPU alta
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="High CPU Usage" \
  --condition-display-name="CPU > 80%" \
  --condition-threshold-value=0.8 \
  --condition-threshold-duration=300s \
  --project=dev-manifold-ao
```

---

## 🔄 Rollback

### Rollback da API

```bash
# Listar instance templates
gcloud compute instance-templates list --project=dev-manifold-ao

# Fazer rollback para template anterior
PREVIOUS_TEMPLATE="api-1234567890-abc123"

gcloud compute instance-groups managed rolling-action start-update api-group-east \
  --project=dev-manifold-ao \
  --zone=us-east4-a \
  --version=template=${PREVIOUS_TEMPLATE} \
  --max-unavailable=0
```

---

## 🧪 Ambiente de Teste Local

Para testar localmente antes do deploy:

```bash
# 1. Instalar dependências
cd backend/api
yarn install

# 2. Compilar TypeScript
yarn build

# 3. Executar localmente
node lib/serve.js

# Ou com hot-reload:
yarn dev
```

### Docker Local

```bash
# Build da imagem localmente
docker build -t manifold-api:local ./backend/api

# Executar container
docker run -p 8088:80 \
  -e GOOGLE_CLOUD_PROJECT=dev-manifold-ao \
  -e NEXT_PUBLIC_FIREBASE_ENV=DEV \
  -e SUPABASE_INSTANCE_ID=... \
  -e SUPABASE_PASSWORD=... \
  manifold-api:local
```

---

## 📝 Checklist de Deploy

### Antes do Deploy

- [ ] Código commitado no Git
- [ ] Variáveis de ambiente configuradas
- [ ] Secrets configurados no GCP
- [ ] Build local bem-sucedido
- [ ] Testes passando
- [ ] Docker instalado e configurado
- [ ] gcloud CLI autenticado

### Durante o Deploy

- [ ] Build remoto concluído
- [ ] Imagem Docker criada
- [ ] Instance template criado
- [ ] Rolling update iniciado
- [ ] Nova instância healthy

### Após o Deploy

- [ ] API respondendo
- [ ] Testes de fumaça (smoke tests)
- [ ] Logs sem erros críticos
- [ ] Métricas normais
- [ ] Notificar equipe

---

## 🌐 URLs Importantes

**DEV:**
- Console: https://console.cloud.google.com/compute/instances?project=dev-manifold-ao
- Logs: https://console.cloud.google.com/logs/query?project=dev-manifold-ao

**PROD:**
- Console: https://console.cloud.google.com/compute/instances?project=mantic-markets
- Logs: https://console.cloud.google.com/logs/query?project=mantic-markets

---

## 💡 Dicas

1. **Use DEV primeiro**: Sempre teste em DEV antes de fazer deploy em PROD
2. **Monitore logs**: Acompanhe logs durante e após deploy
3. **Rollback plan**: Tenha sempre um plano de rollback
4. **Backup database**: Faça backup do Supabase antes de mudanças grandes
5. **Documentar mudanças**: Mantenha changelog de deploys

---

## 🆘 Suporte

Em caso de problemas:

1. Verificar logs da instância
2. Verificar Cloud Logging no GCP
3. SSH na instância para debug
4. Consultar documentação do GCP
5. Rollback se necessário

---

## 📚 Referências

- [Google Cloud Compute Engine Docs](https://cloud.google.com/compute/docs)
- [Docker Docs](https://docs.docker.com/)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Supabase Docs](https://supabase.com/docs)
