#!/bin/bash

#################################################################################
# Script de Verificação de Deploy - Manifold Backend
#################################################################################
#
# Uso: ./verify-deployment.sh [dev|prod]
#
# Este script verifica se o deploy foi bem-sucedido testando:
# - Instâncias estão rodando
# - Services estão healthy
# - API está respondendo
# - Database está acessível
#
#################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Functions
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

print_banner() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║                                                           ║"
    echo "║          Verificação de Deploy - Manifold Backend        ║"
    echo "║                                                           ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Parse arguments
if [ $# -lt 1 ]; then
    echo "Uso: $0 [dev|prod]"
    exit 1
fi

ENV=$1

case $ENV in
    dev)
        GCLOUD_PROJECT=dev-manifold-ao
        REGION=us-east4
        ZONE=us-east4-a
        ;;
    prod)
        GCLOUD_PROJECT=mantic-markets
        REGION=us-east4
        ZONE=us-east4-a
        ;;
    *)
        log_error "Ambiente inválido: $ENV. Use 'dev' ou 'prod'."
        exit 1
        ;;
esac

print_banner

log_info "Ambiente: $ENV"
log_info "Projeto: $GCLOUD_PROJECT"
log_info "Região: $REGION"
echo ""

#################################################################################
# 1. Verificar Instâncias
#################################################################################

log_info "═══════════════════════════════════════════════════════"
log_info "1. Verificando Instâncias no GCP"
log_info "═══════════════════════════════════════════════════════"
echo ""

# API Instances
log_info "Verificando instâncias da API..."
API_INSTANCES=$(gcloud compute instances list \
    --project=$GCLOUD_PROJECT \
    --filter="name~'^api-' AND zone:$ZONE" \
    --format="value(name,status)")

if [ -z "$API_INSTANCES" ]; then
    log_error "Nenhuma instância da API encontrada!"
else
    while IFS=$'\t' read -r name status; do
        if [ "$status" = "RUNNING" ]; then
            log_success "API Instance: $name - $status"
        else
            log_warning "API Instance: $name - $status (não está RUNNING)"
        fi
    done <<< "$API_INSTANCES"
fi
echo ""

# Scheduler Instance
log_info "Verificando instância do Scheduler..."
SCHEDULER_INSTANCE=$(gcloud compute instances list \
    --project=$GCLOUD_PROJECT \
    --filter="name='scheduler' AND zone:$ZONE" \
    --format="value(name,status)")

if [ -z "$SCHEDULER_INSTANCE" ]; then
    log_warning "Instância do Scheduler não encontrada (pode não estar deployada)"
else
    name=$(echo $SCHEDULER_INSTANCE | awk '{print $1}')
    status=$(echo $SCHEDULER_INSTANCE | awk '{print $2}')
    if [ "$status" = "RUNNING" ]; then
        log_success "Scheduler Instance: $name - $status"
    else
        log_warning "Scheduler Instance: $name - $status"
    fi
fi
echo ""

#################################################################################
# 2. Verificar Managed Instance Group
#################################################################################

log_info "═══════════════════════════════════════════════════════"
log_info "2. Verificando Managed Instance Group"
log_info "═══════════════════════════════════════════════════════"
echo ""

MIG_NAME="api-group-east"
MIG_STATUS=$(gcloud compute instance-groups managed describe $MIG_NAME \
    --zone=$ZONE \
    --project=$GCLOUD_PROJECT \
    --format="value(status.isStable)" 2>/dev/null || echo "NOT_FOUND")

if [ "$MIG_STATUS" = "NOT_FOUND" ]; then
    log_warning "Managed Instance Group não encontrado"
elif [ "$MIG_STATUS" = "True" ]; then
    log_success "Managed Instance Group está estável"

    # Mostrar tamanho do grupo
    TARGET_SIZE=$(gcloud compute instance-groups managed describe $MIG_NAME \
        --zone=$ZONE \
        --project=$GCLOUD_PROJECT \
        --format="value(targetSize)")
    log_info "Target Size: $TARGET_SIZE instâncias"
else
    log_warning "Managed Instance Group não está estável (pode estar atualizando)"
fi
echo ""

#################################################################################
# 3. Testar Conectividade da API
#################################################################################

log_info "═══════════════════════════════════════════════════════"
log_info "3. Testando Conectividade da API"
log_info "═══════════════════════════════════════════════════════"
echo ""

# Obter IP da API
API_IP=$(gcloud compute instances list \
    --project=$GCLOUD_PROJECT \
    --filter="name~'^api-' AND zone:$ZONE" \
    --format="value(networkInterfaces[0].accessConfigs[0].natIP)" \
    --limit=1)

if [ -z "$API_IP" ]; then
    log_error "Não foi possível obter IP da API"
else
    log_info "IP da API: $API_IP"

    # Testar conexão HTTP
    log_info "Testando conexão HTTP..."
    if curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "http://${API_IP}/" | grep -q "200\|404\|301"; then
        log_success "API está respondendo"
    else
        log_error "API não está respondendo na porta 80"
    fi

    # Testar health endpoint (se existir)
    log_info "Testando endpoint /v0/health..."
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "http://${API_IP}/v0/health" || echo "000")
    if [ "$HTTP_STATUS" = "200" ]; then
        log_success "Health endpoint respondeu com 200 OK"
    else
        log_warning "Health endpoint retornou: $HTTP_STATUS (pode não estar implementado)"
    fi
fi
echo ""

#################################################################################
# 4. Verificar Logs Recentes
#################################################################################

log_info "═══════════════════════════════════════════════════════"
log_info "4. Verificando Logs Recentes"
log_info "═══════════════════════════════════════════════════════"
echo ""

log_info "Buscando erros nos últimos 10 minutos..."
ERROR_LOGS=$(gcloud logging read \
    "resource.type=gce_instance AND severity>=ERROR AND timestamp>=\"$(date -u -d '10 minutes ago' --iso-8601=seconds)\"" \
    --limit 5 \
    --project=$GCLOUD_PROJECT \
    --format="value(timestamp,jsonPayload.message)" 2>/dev/null || echo "")

if [ -z "$ERROR_LOGS" ]; then
    log_success "Nenhum erro encontrado nos últimos 10 minutos"
else
    log_warning "Erros encontrados:"
    echo "$ERROR_LOGS"
fi
echo ""

#################################################################################
# 5. Verificar Docker Containers
#################################################################################

log_info "═══════════════════════════════════════════════════════"
log_info "5. Verificando Status dos Containers Docker"
log_info "═══════════════════════════════════════════════════════"
echo ""

if [ ! -z "$API_INSTANCES" ]; then
    FIRST_API_INSTANCE=$(echo "$API_INSTANCES" | head -n1 | awk '{print $1}')

    log_info "Verificando containers em: $FIRST_API_INSTANCE"

    DOCKER_STATUS=$(gcloud compute ssh $FIRST_API_INSTANCE \
        --project=$GCLOUD_PROJECT \
        --zone=$ZONE \
        --command="sudo docker ps --format '{{.Names}}\t{{.Status}}'" 2>/dev/null || echo "SSH_FAILED")

    if [ "$DOCKER_STATUS" = "SSH_FAILED" ]; then
        log_warning "Não foi possível conectar via SSH (firewall ou permissões)"
    else
        if [ -z "$DOCKER_STATUS" ]; then
            log_error "Nenhum container Docker rodando!"
        else
            while IFS=$'\t' read -r name status; do
                if [[ "$status" == *"Up"* ]]; then
                    log_success "Container: $name - $status"
                else
                    log_warning "Container: $name - $status"
                fi
            done <<< "$DOCKER_STATUS"
        fi
    fi
fi
echo ""

#################################################################################
# 6. Verificar Load Balancer (se configurado)
#################################################################################

log_info "═══════════════════════════════════════════════════════"
log_info "6. Verificando Load Balancer"
log_info "═══════════════════════════════════════════════════════"
echo ""

LB_EXISTS=$(gcloud compute backend-services list \
    --project=$GCLOUD_PROJECT \
    --filter="name~'api'" \
    --format="value(name)" 2>/dev/null || echo "")

if [ -z "$LB_EXISTS" ]; then
    log_warning "Load Balancer não configurado (deployando direto em instâncias)"
else
    log_success "Load Balancer encontrado: $LB_EXISTS"

    # Verificar health do backend
    BACKEND_HEALTH=$(gcloud compute backend-services get-health $LB_EXISTS \
        --global \
        --project=$GCLOUD_PROJECT \
        --format="value(status.healthStatus.healthState)" 2>/dev/null || echo "")

    if [[ "$BACKEND_HEALTH" == *"HEALTHY"* ]]; then
        log_success "Backend services estão healthy"
    else
        log_warning "Alguns backends podem não estar healthy"
    fi
fi
echo ""

#################################################################################
# 7. Summary
#################################################################################

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    RESUMO DA VERIFICAÇÃO                  ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

log_info "Ambiente: $ENV"
log_info "Projeto: $GCLOUD_PROJECT"
echo ""

log_info "Links úteis:"
echo ""
echo "  Console GCP:"
echo "  ${BLUE}https://console.cloud.google.com/compute/instances?project=$GCLOUD_PROJECT${NC}"
echo ""
echo "  Cloud Logging:"
echo "  ${BLUE}https://console.cloud.google.com/logs/query?project=$GCLOUD_PROJECT${NC}"
echo ""
echo "  Monitoring:"
echo "  ${BLUE}https://console.cloud.google.com/monitoring?project=$GCLOUD_PROJECT${NC}"
echo ""

if [ ! -z "$API_IP" ]; then
    echo "  API URL:"
    echo "  ${BLUE}http://${API_IP}${NC}"
    echo ""
fi

log_success "Verificação concluída!"
