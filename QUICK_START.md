# Quick Start - Deploy do Backend no GCP

Este guia rápido te ajuda a fazer o primeiro deploy do backend em **menos de 30 minutos**.

## 🚀 Setup Inicial (Primeira Vez)

### 1. Clonar e Instalar Dependências

```bash
# Clonar repositório (se ainda não tiver)
git clone <repo-url> manifold-ao
cd manifold-ao

# Instalar dependências
yarn install
```

### 2. Instalar Ferramentas Necessárias

```bash
# Node.js 20+ (se não tiver)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Yarn (se não tiver)
npm install -g yarn

# Docker (se não tiver)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# Logout e login novamente

# Google Cloud SDK (se não tiver)
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
```

### 3. Configurar GCP

```bash
# Login no GCP
gcloud auth login

# Criar projeto (escolha um nome único)
PROJECT_ID="manifold-ao-dev"
gcloud projects create $PROJECT_ID --name="Manifold Angola Dev"

# Definir projeto padrão
gcloud config set project $PROJECT_ID

# Habilitar APIs necessárias
gcloud services enable compute.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  --project=$PROJECT_ID

# Configurar Docker
gcloud auth configure-docker us-east4-docker.pkg.dev

# Criar Artifact Registry
gcloud artifacts repositories create builds \
  --repository-format=docker \
  --location=us-east4 \
  --project=$PROJECT_ID
```

### 4. Configurar Supabase

```bash
# 1. Acesse https://supabase.com e crie uma conta
# 2. Crie um novo projeto
# 3. Copie as credenciais:

# Suas credenciais Supabase:
SUPABASE_INSTANCE_ID="seu-instance-id"        # Ex: abcdefghijklmnop
SUPABASE_PASSWORD="sua-senha-postgres"
SUPABASE_KEY="sua-anon-key"
SUPABASE_JWT_SECRET="seu-jwt-secret"
```

### 5. Configurar Secrets no GCP

```bash
# Supabase
echo -n "$SUPABASE_KEY" | gcloud secrets create SUPABASE_KEY \
  --data-file=- --project=$PROJECT_ID

echo -n "$SUPABASE_PASSWORD" | gcloud secrets create SUPABASE_PASSWORD \
  --data-file=- --project=$PROJECT_ID

echo -n "$SUPABASE_JWT_SECRET" | gcloud secrets create SUPABASE_JWT_SECRET \
  --data-file=- --project=$PROJECT_ID

# Outros secrets (se tiver)
# Stripe, Firebase, etc.
```

### 6. Criar Arquivo .env Local

```bash
cat > .env.local << EOF
# GCP
GOOGLE_CLOUD_PROJECT=$PROJECT_ID
NEXT_PUBLIC_FIREBASE_ENV=DEV

# Supabase
SUPABASE_INSTANCE_ID=$SUPABASE_INSTANCE_ID
SUPABASE_PASSWORD=$SUPABASE_PASSWORD
SUPABASE_KEY=$SUPABASE_KEY
SUPABASE_JWT_SECRET=$SUPABASE_JWT_SECRET

# Outras variáveis conforme necessário
EOF
```

## 🎯 Deploy Rápido

### Deploy da API (DEV)

```bash
# Método 1: Script automatizado (recomendado)
./deploy-backend.sh dev api

# Método 2: Script original
cd backend/api
./deploy-api.sh dev
```

### Verificar Deploy

```bash
# Verificar se tudo está funcionando
./verify-deployment.sh dev

# Ou manualmente:
gcloud compute instances list --project=$PROJECT_ID
```

## 🧪 Testar Localmente Antes de Deploy

```bash
# Instalar dependências
cd backend/api
yarn install

# Compilar TypeScript
yarn build

# Rodar localmente
yarn dev

# Em outro terminal, testar:
curl http://localhost:8088/health
```

## 📝 Troubleshooting Rápido

### Problema: "Docker not found"
```bash
# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# Logout e login
```

### Problema: "gcloud authentication failed"
```bash
gcloud auth login
gcloud auth application-default login
```

### Problema: "Permission denied" no Docker
```bash
sudo usermod -aG docker $USER
# Logout e login novamente
```

### Problema: Build falha com erro TypeScript
```bash
cd backend/api
rm -rf node_modules lib
yarn install
yarn build
```

### Problema: Secrets não encontrados
```bash
# Verificar se secrets existem
gcloud secrets list --project=$PROJECT_ID

# Dar permissão para Compute Engine
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## 📊 Monitoramento Pós-Deploy

### Ver logs em tempo real
```bash
# Logs da última hora
gcloud logging read "resource.type=gce_instance" \
  --limit 50 \
  --project=$PROJECT_ID \
  --format json

# Ou via console:
# https://console.cloud.google.com/logs/query?project=$PROJECT_ID
```

### Verificar status das instâncias
```bash
gcloud compute instances list --project=$PROJECT_ID

# Status do Managed Instance Group
gcloud compute instance-groups managed describe api-group-east \
  --zone=us-east4-a \
  --project=$PROJECT_ID
```

### SSH na instância para debug
```bash
# Listar instâncias
gcloud compute instances list --project=$PROJECT_ID

# SSH
gcloud compute ssh INSTANCE_NAME \
  --zone=us-east4-a \
  --project=$PROJECT_ID

# Dentro da VM, verificar Docker:
sudo docker ps
sudo docker logs $(sudo docker ps -q)
```

## 🔄 Próximos Deploys

Após o primeiro deploy, deploys seguintes são mais rápidos:

```bash
# Deploy rápido da API
./deploy-backend.sh dev api

# Deploy de tudo
./deploy-backend.sh dev all

# Verificar
./verify-deployment.sh dev
```

## 🌐 URLs Importantes

- **Console GCP**: https://console.cloud.google.com
- **Compute Engine**: https://console.cloud.google.com/compute/instances?project=$PROJECT_ID
- **Cloud Logging**: https://console.cloud.google.com/logs/query?project=$PROJECT_ID
- **Supabase Dashboard**: https://app.supabase.com

## 💡 Dicas Importantes

1. **Sempre teste em DEV primeiro** antes de ir para PROD
2. **Monitore os logs** durante e após o deploy
3. **Mantenha backup** do Supabase antes de mudanças grandes
4. **Use tags Git** para marcar versões deployadas
5. **Documente mudanças** em um CHANGELOG.md

## 🆘 Precisa de Ajuda?

1. Verificar documentação completa: `DEPLOYMENT_GUIDE.md`
2. Verificar logs: `./verify-deployment.sh dev`
3. Console do GCP: https://console.cloud.google.com
4. Documentação GCP: https://cloud.google.com/docs

## ✅ Checklist de Deploy

- [ ] Node.js 20+ instalado
- [ ] Yarn instalado
- [ ] Docker instalado e configurado
- [ ] gcloud CLI instalado
- [ ] Autenticado no GCP
- [ ] Projeto GCP criado
- [ ] APIs habilitadas
- [ ] Supabase configurado
- [ ] Secrets criados no GCP
- [ ] `.env.local` criado
- [ ] Build local bem-sucedido
- [ ] Deploy executado
- [ ] Verificação passou
- [ ] API respondendo

---

**Tempo estimado de setup**: 20-30 minutos
**Tempo estimado de deploy**: 10-15 minutos
**Total**: ~45 minutos para o primeiro deploy completo
