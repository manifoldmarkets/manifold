# Documentação de Deploy - Manifold Backend

Este diretório contém toda a documentação e scripts necessários para fazer deploy do backend Manifold Markets no Google Cloud Platform (GCP).

## 📚 Documentação Disponível

### 1. **QUICK_START.md** ⚡
Guia rápido para fazer o primeiro deploy em menos de 30 minutos.
- Setup inicial simplificado
- Comandos essenciais
- Troubleshooting rápido

**Use quando**: Você quer começar rapidamente e já tem alguma experiência com GCP.

### 2. **DEPLOYMENT_GUIDE.md** 📖
Guia completo e detalhado de deployment.
- Explicação de cada componente
- Configuração passo a passo
- Troubleshooting avançado
- Monitoramento e observabilidade
- Rollback procedures

**Use quando**: Você precisa entender em profundidade como tudo funciona.

## 🛠️ Scripts Automatizados

### 1. **setup-gcp.sh** 🚀
Script interativo de setup inicial do GCP.

```bash
./setup-gcp.sh
```

**O que faz:**
- Cria/seleciona projeto GCP
- Habilita todas as APIs necessárias
- Configura Docker e Artifact Registry
- Cria secrets no Secret Manager
- Configura permissões
- Gera arquivo .env.local

**Quando usar**: Primeira vez que vai configurar o ambiente GCP.

---

### 2. **deploy-backend.sh** 🚀
Script automatizado de deploy com validações.

```bash
# Sintaxe
./deploy-backend.sh [dev|prod] [api|scheduler|discord-bot|all]

# Exemplos
./deploy-backend.sh dev api              # Deploy da API em DEV
./deploy-backend.sh prod all             # Deploy completo em PROD
./deploy-backend.sh dev scheduler        # Deploy do Scheduler em DEV
```

**O que faz:**
- Valida pré-requisitos (Node, Docker, gcloud)
- Verifica estrutura do projeto
- Executa build e deploy
- Mostra resumo e links úteis

**Quando usar**: Sempre que quiser fazer deploy de forma automatizada e segura.

---

### 3. **verify-deployment.sh** ✅
Script de verificação pós-deploy.

```bash
./verify-deployment.sh [dev|prod]

# Exemplo
./verify-deployment.sh dev
```

**O que faz:**
- Verifica se instâncias estão rodando
- Testa conectividade da API
- Verifica logs recentes
- Checa status dos containers Docker
- Valida Load Balancer (se configurado)
- Gera relatório de saúde

**Quando usar**: Após cada deploy para validar que tudo está funcionando.

---

## 🎯 Fluxo de Trabalho Recomendado

### Primeira Vez (Setup Inicial)

```bash
# 1. Setup do GCP (uma vez)
./setup-gcp.sh

# 2. Deploy da API
./deploy-backend.sh dev api

# 3. Verificar
./verify-deployment.sh dev
```

### Deploys Subsequentes

```bash
# 1. Fazer mudanças no código
git add .
git commit -m "feat: adicionar nova feature"

# 2. Deploy
./deploy-backend.sh dev api

# 3. Verificar
./verify-deployment.sh dev

# 4. Se tudo OK, deploy em PROD
./deploy-backend.sh prod api
```

---

## 📋 Checklist Rápido

### Antes do Primeiro Deploy

- [ ] Node.js 20+ instalado
- [ ] Yarn instalado
- [ ] Docker instalado
- [ ] gcloud CLI instalado
- [ ] Conta GCP criada
- [ ] Conta Supabase criada
- [ ] Executou `./setup-gcp.sh`

### Antes de Cada Deploy

- [ ] Código testado localmente
- [ ] Testes passando
- [ ] Código commitado no Git
- [ ] `.env.local` atualizado (se necessário)
- [ ] Secrets atualizados no GCP (se necessário)

### Após Cada Deploy

- [ ] Executou `./verify-deployment.sh`
- [ ] API está respondendo
- [ ] Logs sem erros críticos
- [ ] Testes de smoke passando
- [ ] Equipe notificada (se PROD)

---

## 🌍 Ambientes

### DEV
- **Projeto GCP**: `dev-manifold-ao` (ou seu projeto dev)
- **Machine Type**: `e2-small` (2 vCPU, 2GB RAM)
- **Propósito**: Testes e desenvolvimento
- **Custo**: ~$15-30/mês

### PROD
- **Projeto GCP**: `mantic-markets` (ou seu projeto prod)
- **Machine Type**: `c2-standard-4` (4 vCPU, 16GB RAM)
- **Propósito**: Produção com usuários reais
- **Custo**: ~$150-300/mês

---

## 📁 Estrutura de Arquivos

```
manifold-markets/
│
├── README_DEPLOYMENT.md          # Este arquivo
├── QUICK_START.md                # Guia rápido
├── DEPLOYMENT_GUIDE.md           # Guia completo
│
├── setup-gcp.sh                  # Setup inicial automatizado
├── deploy-backend.sh             # Deploy automatizado
├── verify-deployment.sh          # Verificação pós-deploy
│
├── .env.local                    # Variáveis de ambiente (gerado)
│
└── backend/
    ├── api/
    │   ├── deploy-api.sh         # Script original de deploy da API
    │   ├── Dockerfile
    │   └── ecosystem.config.js
    │
    ├── scheduler/
    │   ├── deploy-scheduler.sh   # Script original de deploy do scheduler
    │   └── Dockerfile
    │
    └── discord-bot/
        ├── deploy.sh             # Script original de deploy do bot
        └── Dockerfile
```

---

## 🔧 Comandos Úteis

### GCP

```bash
# Listar projetos
gcloud projects list

# Definir projeto padrão
gcloud config set project PROJECT_ID

# Listar instâncias
gcloud compute instances list --project=PROJECT_ID

# Ver logs
gcloud logging read "resource.type=gce_instance" --limit 50 --project=PROJECT_ID

# SSH em instância
gcloud compute ssh INSTANCE_NAME --zone=ZONE --project=PROJECT_ID
```

### Docker

```bash
# Listar imagens
gcloud artifacts docker images list us-east4-docker.pkg.dev/PROJECT_ID/builds

# Build local
docker build -t manifold-api:local ./backend/api

# Run local
docker run -p 8088:80 -e GOOGLE_CLOUD_PROJECT=PROJECT_ID manifold-api:local
```

### Supabase

```bash
# Conectar ao Supabase via psql (se tiver credenciais)
psql "postgresql://postgres:PASSWORD@db.INSTANCE_ID.supabase.co:5432/postgres"
```

---

## 🆘 Troubleshooting

### Problema: Deploy falha com "Docker not found"
**Solução**: Instale Docker e adicione seu usuário ao grupo docker
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# Logout e login novamente
```

### Problema: "Permission denied" ao executar scripts
**Solução**: Torne os scripts executáveis
```bash
chmod +x setup-gcp.sh deploy-backend.sh verify-deployment.sh
```

### Problema: Build falha com erro TypeScript
**Solução**: Limpe e reinstale dependências
```bash
cd backend/api
rm -rf node_modules lib
yarn install
yarn build
```

### Problema: API não está respondendo após deploy
**Solução**: Verifique logs e status do container
```bash
./verify-deployment.sh dev
gcloud compute ssh INSTANCE_NAME --project=PROJECT_ID --zone=ZONE
sudo docker logs $(sudo docker ps -q)
```

---

## 📊 Monitoramento

### Dashboards GCP

- **Compute Engine**: https://console.cloud.google.com/compute/instances
- **Cloud Logging**: https://console.cloud.google.com/logs/query
- **Cloud Monitoring**: https://console.cloud.google.com/monitoring
- **Secret Manager**: https://console.cloud.google.com/security/secret-manager

### Métricas Importantes

- **CPU Usage**: < 80%
- **Memory Usage**: < 90%
- **Request Latency (p95)**: < 500ms
- **Error Rate**: < 1%
- **Uptime**: > 99.9%

---

## 🔄 Rollback

Se algo der errado após deploy:

```bash
# 1. Listar templates disponíveis
gcloud compute instance-templates list --project=PROJECT_ID

# 2. Fazer rollback para versão anterior
PREVIOUS_TEMPLATE="api-TIMESTAMP-HASH"
gcloud compute instance-groups managed rolling-action start-update api-group-east \
  --project=PROJECT_ID \
  --zone=us-east4-a \
  --version=template=$PREVIOUS_TEMPLATE \
  --max-unavailable=0
```

---

## 💰 Estimativa de Custos

### DEV (desenvolvimento)
- **Compute Engine**: ~$15-20/mês (e2-small)
- **Supabase**: Free tier (até 500MB)
- **Artifact Registry**: ~$0.10/GB/mês
- **Total estimado**: ~$15-30/mês

### PROD (produção)
- **Compute Engine**: ~$120-150/mês (c2-standard-4)
- **Supabase**: ~$25/mês (Pro plan)
- **Load Balancer**: ~$20/mês
- **Artifact Registry**: ~$1-2/mês
- **Logging/Monitoring**: ~$10-20/mês
- **Total estimado**: ~$175-220/mês

*Valores aproximados, variam com uso*

---

## 📞 Suporte

Para questões sobre:

1. **GCP**: https://cloud.google.com/support
2. **Supabase**: https://supabase.com/docs
3. **Docker**: https://docs.docker.com
4. **Node.js**: https://nodejs.org/docs

---

## ✅ Próximos Passos

Após ter o backend rodando:

1. **Configurar domínio customizado** (opcional)
2. **Configurar SSL/HTTPS** com Load Balancer
3. **Configurar alertas** no Cloud Monitoring
4. **Implementar CI/CD** com GitHub Actions
5. **Configurar backups automáticos** do Supabase
6. **Adicionar testes automatizados** de integração
7. **Implementar Multicaixa Express** (próxima feature!)

---

## 📝 Changelog

### 2025-01-06
- Criação da documentação de deployment
- Scripts automatizados de setup e deploy
- Script de verificação pós-deploy
- Guias quick start e completo

---

**Última atualização**: Janeiro 2025
**Maintainer**: Equipe Manifold Angola
**Versão**: 1.0.0
