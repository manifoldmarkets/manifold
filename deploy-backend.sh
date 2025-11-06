#!/bin/bash

#################################################################################
# Script de Deploy Automatizado - Manifold Backend
#################################################################################
#
# Uso: ./deploy-backend.sh [dev|prod] [api|scheduler|discord-bot|all]
#
# Exemplos:
#   ./deploy-backend.sh dev api              # Deploy da API em DEV
#   ./deploy-backend.sh prod all             # Deploy de tudo em PROD
#   ./deploy-backend.sh dev scheduler        # Deploy do Scheduler em DEV
#
#################################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_banner() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║                                                           ║"
    echo "║          Manifold Markets - Deploy Automatizado          ║"
    echo "║                                                           ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

check_prerequisites() {
    log_info "Verificando pré-requisitos..."

    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js não encontrado. Instale Node.js 20+"
        exit 1
    fi
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 20 ]; then
        log_error "Node.js versão 20+ necessário. Versão atual: $(node -v)"
        exit 1
    fi
    log_success "Node.js $(node -v) ✓"

    # Check Yarn
    if ! command -v yarn &> /dev/null; then
        log_error "Yarn não encontrado. Execute: npm install -g yarn"
        exit 1
    fi
    log_success "Yarn $(yarn -v) ✓"

    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker não encontrado. Instale Docker: https://docs.docker.com/engine/install/"
        exit 1
    fi
    log_success "Docker $(docker -v | awk '{print $3}' | tr -d ',') ✓"

    # Check gcloud
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI não encontrado. Instale: https://cloud.google.com/sdk/docs/install"
        exit 1
    fi
    log_success "gcloud $(gcloud version | head -n1 | awk '{print $4}') ✓"

    # Check gcloud authentication
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
        log_error "gcloud não autenticado. Execute: gcloud auth login"
        exit 1
    fi
    GCLOUD_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)")
    log_success "gcloud autenticado como: $GCLOUD_ACCOUNT ✓"

    log_success "Todos os pré-requisitos verificados!"
    echo ""
}

check_project_structure() {
    log_info "Verificando estrutura do projeto..."

    if [ ! -d "backend" ]; then
        log_error "Diretório backend/ não encontrado. Execute este script da raiz do projeto."
        exit 1
    fi

    if [ ! -d "backend/api" ]; then
        log_error "Diretório backend/api/ não encontrado."
        exit 1
    fi

    if [ ! -d "backend/shared" ]; then
        log_error "Diretório backend/shared/ não encontrado."
        exit 1
    fi

    if [ ! -d "common" ]; then
        log_error "Diretório common/ não encontrado."
        exit 1
    fi

    log_success "Estrutura do projeto OK ✓"
    echo ""
}

set_environment() {
    ENV=$1

    case $ENV in
        dev)
            export NEXT_PUBLIC_FIREBASE_ENV=DEV
            export GCLOUD_PROJECT=dev-manifold-ao
            log_info "Ambiente: ${GREEN}DEV${NC}"
            ;;
        prod)
            export NEXT_PUBLIC_FIREBASE_ENV=PROD
            export GCLOUD_PROJECT=mantic-markets
            log_warning "Ambiente: ${RED}PRODUCTION${NC}"
            read -p "Tem certeza que quer fazer deploy em PRODUÇÃO? (yes/no): " CONFIRM
            if [ "$CONFIRM" != "yes" ]; then
                log_info "Deploy cancelado."
                exit 0
            fi
            ;;
        *)
            log_error "Ambiente inválido: $ENV. Use 'dev' ou 'prod'."
            exit 1
            ;;
    esac

    # Set gcloud project
    gcloud config set project $GCLOUD_PROJECT &> /dev/null
    log_success "Projeto GCP configurado: $GCLOUD_PROJECT ✓"
    echo ""
}

deploy_api() {
    log_info "═══════════════════════════════════════════════════════"
    log_info "               Iniciando Deploy da API                 "
    log_info "═══════════════════════════════════════════════════════"
    echo ""

    cd backend/api

    log_info "Executando script de deploy da API..."
    ./deploy-api.sh $ENV

    log_success "Deploy da API concluído!"
    cd ../..
}

deploy_scheduler() {
    log_info "═══════════════════════════════════════════════════════"
    log_info "            Iniciando Deploy do Scheduler              "
    log_info "═══════════════════════════════════════════════════════"
    echo ""

    cd backend/scheduler

    log_info "Executando script de deploy do Scheduler..."
    ./deploy-scheduler.sh $ENV

    log_success "Deploy do Scheduler concluído!"
    cd ../..
}

deploy_discord_bot() {
    log_info "═══════════════════════════════════════════════════════"
    log_info "          Iniciando Deploy do Discord Bot              "
    log_info "═══════════════════════════════════════════════════════"
    echo ""

    cd backend/discord-bot

    log_info "Executando script de deploy do Discord Bot..."
    ./deploy.sh $ENV

    log_success "Deploy do Discord Bot concluído!"
    cd ../..
}

show_deployment_summary() {
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                           ║${NC}"
    echo -e "${GREEN}║                  DEPLOY CONCLUÍDO COM SUCESSO!            ║${NC}"
    echo -e "${GREEN}║                                                           ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""

    log_info "Ambiente: $ENV"
    log_info "Projeto GCP: $GCLOUD_PROJECT"
    log_info "Serviços deployados: $SERVICE"
    echo ""

    log_info "Próximos passos:"
    echo "  1. Verificar status das instâncias:"
    echo "     ${BLUE}gcloud compute instances list --project=$GCLOUD_PROJECT${NC}"
    echo ""
    echo "  2. Verificar logs:"
    echo "     ${BLUE}gcloud logging read \"resource.type=gce_instance\" --limit 50 --project=$GCLOUD_PROJECT${NC}"
    echo ""
    echo "  3. Testar API:"
    echo "     ${BLUE}curl http://API_IP/v0/health${NC}"
    echo ""
    echo "  4. Monitorar no console:"
    echo "     ${BLUE}https://console.cloud.google.com/compute/instances?project=$GCLOUD_PROJECT${NC}"
    echo ""
}

#################################################################################
# MAIN
#################################################################################

print_banner

# Parse arguments
if [ $# -lt 2 ]; then
    echo "Uso: $0 [dev|prod] [api|scheduler|discord-bot|all]"
    echo ""
    echo "Exemplos:"
    echo "  $0 dev api              # Deploy da API em DEV"
    echo "  $0 prod all             # Deploy de tudo em PROD"
    echo "  $0 dev scheduler        # Deploy do Scheduler em DEV"
    exit 1
fi

ENV=$1
SERVICE=$2

# Run checks
check_prerequisites
check_project_structure
set_environment $ENV

# Deploy based on service selection
case $SERVICE in
    api)
        deploy_api
        ;;
    scheduler)
        deploy_scheduler
        ;;
    discord-bot)
        deploy_discord_bot
        ;;
    all)
        deploy_api
        echo ""
        deploy_scheduler
        echo ""
        deploy_discord_bot
        ;;
    *)
        log_error "Serviço inválido: $SERVICE"
        echo "Serviços válidos: api, scheduler, discord-bot, all"
        exit 1
        ;;
esac

show_deployment_summary

log_success "🚀 Deploy finalizado com sucesso!"
