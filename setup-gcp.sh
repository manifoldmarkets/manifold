#!/bin/bash

#################################################################################
# Setup Automatizado do GCP - Manifold Backend
#################################################################################
#
# Este script configura automaticamente:
# - Projeto GCP
# - APIs necessárias
# - Artifact Registry
# - Secrets Manager
# - Permissões
#
# Uso: ./setup-gcp.sh
#
#################################################################################

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
║             MANIFOLD MARKETS - SETUP AUTOMATIZADO GCP            ║
║                                                                   ║
║          Este script vai configurar todo o ambiente GCP          ║
║           necessário para fazer deploy do backend.               ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    echo ""
}

check_gcloud() {
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI não encontrado!"
        echo ""
        echo "Instale o Google Cloud SDK:"
        echo "  curl https://sdk.cloud.google.com | bash"
        echo "  exec -l \$SHELL"
        echo ""
        exit 1
    fi

    log_success "gcloud CLI encontrado"

    # Check authentication
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
        log_warning "gcloud não autenticado"
        echo ""
        read -p "Deseja fazer login agora? (y/n): " DO_LOGIN
        if [ "$DO_LOGIN" = "y" ]; then
            gcloud auth login
        else
            log_error "Autenticação necessária. Execute: gcloud auth login"
            exit 1
        fi
    fi

    ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)")
    log_success "Autenticado como: $ACCOUNT"
    echo ""
}

get_project_info() {
    log_step "1. Configuração do Projeto GCP"

    echo "Digite o ID do projeto GCP (ex: manifold-ao-dev):"
    echo "Nota: Deve ser único globalmente, apenas letras minúsculas, números e hífens"
    read -p "Project ID: " PROJECT_ID

    if [ -z "$PROJECT_ID" ]; then
        log_error "Project ID não pode estar vazio"
        exit 1
    fi

    echo ""
    echo "Digite o nome do projeto (ex: Manifold Angola Dev):"
    read -p "Project Name: " PROJECT_NAME

    if [ -z "$PROJECT_NAME" ]; then
        PROJECT_NAME="Manifold Markets"
    fi

    echo ""
    log_info "Project ID: $PROJECT_ID"
    log_info "Project Name: $PROJECT_NAME"
    echo ""
}

create_or_select_project() {
    log_step "2. Criando/Selecionando Projeto"

    # Check if project exists
    if gcloud projects describe $PROJECT_ID &> /dev/null; then
        log_success "Projeto $PROJECT_ID já existe"
        read -p "Deseja usar este projeto? (y/n): " USE_EXISTING
        if [ "$USE_EXISTING" != "y" ]; then
            log_info "Operação cancelada"
            exit 0
        fi
    else
        log_info "Criando novo projeto: $PROJECT_ID"
        gcloud projects create $PROJECT_ID --name="$PROJECT_NAME"
        log_success "Projeto criado com sucesso!"
    fi

    # Set as default
    gcloud config set project $PROJECT_ID
    log_success "Projeto configurado como padrão"
    echo ""
}

enable_apis() {
    log_step "3. Habilitando APIs Necessárias"

    APIS=(
        "compute.googleapis.com"
        "cloudbuild.googleapis.com"
        "artifactregistry.googleapis.com"
        "secretmanager.googleapis.com"
        "run.googleapis.com"
        "logging.googleapis.com"
        "monitoring.googleapis.com"
    )

    for API in "${APIS[@]}"; do
        log_info "Habilitando $API..."
        gcloud services enable $API --project=$PROJECT_ID
        log_success "$API habilitada"
    done

    echo ""
    log_success "Todas as APIs foram habilitadas!"
    echo ""
}

configure_docker() {
    log_step "4. Configurando Docker e Artifact Registry"

    # Configure Docker
    log_info "Configurando autenticação Docker..."
    gcloud auth configure-docker us-east4-docker.pkg.dev
    log_success "Docker configurado"

    # Create Artifact Registry
    log_info "Criando Artifact Registry repository..."
    if gcloud artifacts repositories describe builds \
        --location=us-east4 \
        --project=$PROJECT_ID &> /dev/null; then
        log_success "Repository 'builds' já existe"
    else
        gcloud artifacts repositories create builds \
            --repository-format=docker \
            --location=us-east4 \
            --description="Docker images for Manifold Backend" \
            --project=$PROJECT_ID
        log_success "Repository 'builds' criado"
    fi
    echo ""
}

configure_secrets() {
    log_step "5. Configurando Secrets Manager"

    echo "Agora vamos configurar os secrets necessários."
    echo ""
    log_warning "IMPORTANTE: Você precisará das seguintes informações:"
    echo "  - Supabase Instance ID, Password, Key, JWT Secret"
    echo "  - Stripe API Key e Webhook Secret (opcional)"
    echo "  - GIDX API credentials (opcional)"
    echo ""
    read -p "Pressione Enter para continuar ou Ctrl+C para cancelar..."
    echo ""

    # Supabase
    log_info "═══ SUPABASE ═══"
    echo ""

    read -p "Supabase Instance ID: " SUPABASE_INSTANCE_ID
    if [ ! -z "$SUPABASE_INSTANCE_ID" ]; then
        echo -n "$SUPABASE_INSTANCE_ID" | gcloud secrets create SUPABASE_INSTANCE_ID \
            --data-file=- --project=$PROJECT_ID 2>/dev/null || \
            echo -n "$SUPABASE_INSTANCE_ID" | gcloud secrets versions add SUPABASE_INSTANCE_ID \
            --data-file=- --project=$PROJECT_ID
        log_success "SUPABASE_INSTANCE_ID configurado"
    fi

    read -sp "Supabase Password: " SUPABASE_PASSWORD
    echo ""
    if [ ! -z "$SUPABASE_PASSWORD" ]; then
        echo -n "$SUPABASE_PASSWORD" | gcloud secrets create SUPABASE_PASSWORD \
            --data-file=- --project=$PROJECT_ID 2>/dev/null || \
            echo -n "$SUPABASE_PASSWORD" | gcloud secrets versions add SUPABASE_PASSWORD \
            --data-file=- --project=$PROJECT_ID
        log_success "SUPABASE_PASSWORD configurado"
    fi

    read -sp "Supabase Key (anon/service key): " SUPABASE_KEY
    echo ""
    if [ ! -z "$SUPABASE_KEY" ]; then
        echo -n "$SUPABASE_KEY" | gcloud secrets create SUPABASE_KEY \
            --data-file=- --project=$PROJECT_ID 2>/dev/null || \
            echo -n "$SUPABASE_KEY" | gcloud secrets versions add SUPABASE_KEY \
            --data-file=- --project=$PROJECT_ID
        log_success "SUPABASE_KEY configurado"
    fi

    read -sp "Supabase JWT Secret: " SUPABASE_JWT_SECRET
    echo ""
    if [ ! -z "$SUPABASE_JWT_SECRET" ]; then
        echo -n "$SUPABASE_JWT_SECRET" | gcloud secrets create SUPABASE_JWT_SECRET \
            --data-file=- --project=$PROJECT_ID 2>/dev/null || \
            echo -n "$SUPABASE_JWT_SECRET" | gcloud secrets versions add SUPABASE_JWT_SECRET \
            --data-file=- --project=$PROJECT_ID
        log_success "SUPABASE_JWT_SECRET configurado"
    fi

    echo ""
    read -p "Deseja configurar Stripe? (y/n): " CONFIGURE_STRIPE
    if [ "$CONFIGURE_STRIPE" = "y" ]; then
        log_info "═══ STRIPE ═══"
        echo ""

        read -sp "Stripe API Key: " STRIPE_APIKEY
        echo ""
        if [ ! -z "$STRIPE_APIKEY" ]; then
            echo -n "$STRIPE_APIKEY" | gcloud secrets create STRIPE_APIKEY \
                --data-file=- --project=$PROJECT_ID 2>/dev/null || \
                echo -n "$STRIPE_APIKEY" | gcloud secrets versions add STRIPE_APIKEY \
                --data-file=- --project=$PROJECT_ID
            log_success "STRIPE_APIKEY configurado"
        fi

        read -sp "Stripe Webhook Secret: " STRIPE_WEBHOOKSECRET
        echo ""
        if [ ! -z "$STRIPE_WEBHOOKSECRET" ]; then
            echo -n "$STRIPE_WEBHOOKSECRET" | gcloud secrets create STRIPE_WEBHOOKSECRET \
                --data-file=- --project=$PROJECT_ID 2>/dev/null || \
                echo -n "$STRIPE_WEBHOOKSECRET" | gcloud secrets versions add STRIPE_WEBHOOKSECRET \
                --data-file=- --project=$PROJECT_ID
            log_success "STRIPE_WEBHOOKSECRET configurado"
        fi
    fi

    echo ""
    log_success "Secrets configurados!"
    echo ""
}

configure_permissions() {
    log_step "6. Configurando Permissões"

    PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
    COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

    log_info "Dando permissão Secret Accessor para Compute Engine..."
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$COMPUTE_SA" \
        --role="roles/secretmanager.secretAccessor" \
        --quiet

    log_success "Permissões configuradas"
    echo ""
}

create_env_file() {
    log_step "7. Criando Arquivo .env.local"

    cat > .env.local << EOF
# GCP Configuration
GOOGLE_CLOUD_PROJECT=$PROJECT_ID
NEXT_PUBLIC_FIREBASE_ENV=DEV

# Supabase
SUPABASE_INSTANCE_ID=$SUPABASE_INSTANCE_ID
# Note: Sensitive values are stored in GCP Secret Manager
# Access them via: gcloud secrets versions access latest --secret=SECRET_NAME

# Region
GCP_REGION=us-east4
GCP_ZONE=us-east4-a
EOF

    log_success "Arquivo .env.local criado"
    echo ""
}

print_summary() {
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║                  SETUP CONCLUÍDO COM SUCESSO!                     ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    log_info "Configuração completa:"
    echo ""
    echo "  ${CYAN}✓${NC} Projeto GCP: $PROJECT_ID"
    echo "  ${CYAN}✓${NC} APIs habilitadas"
    echo "  ${CYAN}✓${NC} Docker configurado"
    echo "  ${CYAN}✓${NC} Artifact Registry criado"
    echo "  ${CYAN}✓${NC} Secrets configurados"
    echo "  ${CYAN}✓${NC} Permissões configuradas"
    echo "  ${CYAN}✓${NC} Arquivo .env.local criado"
    echo ""

    log_info "Próximos passos:"
    echo ""
    echo "  1. Revisar o arquivo .env.local"
    echo ""
    echo "  2. Fazer deploy da API:"
    echo "     ${BLUE}./deploy-backend.sh dev api${NC}"
    echo ""
    echo "  3. Verificar deploy:"
    echo "     ${BLUE}./verify-deployment.sh dev${NC}"
    echo ""

    log_info "Links úteis:"
    echo ""
    echo "  Console GCP:"
    echo "  ${BLUE}https://console.cloud.google.com/home/dashboard?project=$PROJECT_ID${NC}"
    echo ""
    echo "  Compute Engine:"
    echo "  ${BLUE}https://console.cloud.google.com/compute/instances?project=$PROJECT_ID${NC}"
    echo ""
    echo "  Secrets:"
    echo "  ${BLUE}https://console.cloud.google.com/security/secret-manager?project=$PROJECT_ID${NC}"
    echo ""
}

#################################################################################
# MAIN
#################################################################################

print_banner
check_gcloud
get_project_info
create_or_select_project
enable_apis
configure_docker
configure_secrets
configure_permissions
create_env_file
print_summary

log_success "🚀 Setup completo! Você está pronto para fazer deploy!"
