# Guia de Hosting - Manifold Backend

Este documento resume as opções de hospedagem para o backend Manifold Markets.

---

## 📊 Comparação Rápida

| Critério | GCP | VPS Único |
|----------|-----|-----------|
| **Custo/mês** | $180-240 | $25-75 |
| **Setup** | 2-3 horas | 40-60 min |
| **Complexidade** | Alta ⭐⭐⭐⭐⭐ | Baixa ⭐⭐ |
| **Escalabilidade** | Auto ⭐⭐⭐⭐⭐ | Manual ⭐⭐⭐ |
| **Manutenção** | Média | Alta |
| **Control** | Limitado | Total |

---

## 🎯 Recomendações

### **Para Começar (MVP/Testes)**: VPS Único ⭐⭐⭐⭐⭐

**Por quê?**
- ✅ 70-85% mais barato
- ✅ Setup em menos de 1 hora
- ✅ Simplicidade - um servidor só
- ✅ Controle total
- ✅ Fácil de debugar

**Quando usar:**
- Fase MVP (validação do produto)
- Até 1.000 usuários ativos
- Orçamento limitado
- Time pequeno (1-3 pessoas)
- Precisa iterar rápido

**Provedor recomendado:** DigitalOcean
- Data center na África (Cape Town)
- $48/mês (8GB RAM, 4 vCPU)
- Interface simples
- Documentação excelente

### **Para Escalar (Produção Grande)**: GCP

**Por quê?**
- ✅ Auto-scaling automático
- ✅ Alta disponibilidade
- ✅ Load balancing integrado
- ✅ Infraestrutura global
- ✅ Ferramentas enterprise

**Quando usar:**
- Mais de 10.000 usuários ativos
- Alta disponibilidade crítica (99.99% uptime)
- Time de DevOps dedicado
- Precisa distribuição geográfica
- Orçamento adequado ($200+/mês)

---

## 📁 Documentação Disponível

### Opção 1: VPS Único (RECOMENDADO PARA COMEÇAR)

1. **VPS_ANALYSIS.md** - Análise completa e comparação
2. **VPS_DEPLOYMENT_GUIDE.md** - Guia passo a passo
3. **setup-vps-local.sh** - Script automatizado

**Como usar:**
```bash
# 1. Ler a análise
cat VPS_ANALYSIS.md

# 2. Criar VPS (DigitalOcean, Hostinger, etc.)

# 3. Executar script automatizado
./setup-vps-local.sh

# 4. Aplicação rodando em ~40 minutos!
```

### Opção 2: Google Cloud Platform

1. **DEPLOYMENT_GUIDE.md** - Guia completo GCP
2. **QUICK_START.md** - Guia rápido GCP
3. **README_DEPLOYMENT.md** - Índice GCP
4. **setup-gcp.sh** - Setup automatizado
5. **deploy-backend.sh** - Deploy automatizado
6. **verify-deployment.sh** - Verificação

**Como usar:**
```bash
# 1. Ler o quick start
cat QUICK_START.md

# 2. Setup GCP
./setup-gcp.sh

# 3. Deploy
./deploy-backend.sh dev api

# 4. Verificar
./verify-deployment.sh dev
```

---

## 💰 Custos Comparados

### VPS Único

```
DigitalOcean VPS (8GB):      $48/mês
Backups:                     $7/mês
Supabase Pro:                $25/mês
Domínio:                     $1/mês
────────────────────────────────────
TOTAL:                       $81/mês

OU mais barato:

Hetzner VPS (8GB):           $15/mês
Supabase Free:               $0/mês
Domínio:                     $1/mês
────────────────────────────────────
TOTAL:                       $16/mês 🤯
```

### GCP

```
Compute Engine:              $150/mês
Load Balancer:               $20/mês
Artifact Registry:           $2/mês
Secret Manager:              $1/mês
Monitoring:                  $15/mês
Supabase Pro:                $25/mês
────────────────────────────────────
TOTAL:                       $213/mês
```

**Economia VPS:** ~60-92% 💰

---

## 🚀 Roadmap Recomendado

### Fase 1: MVP (Meses 1-3)
**Plataforma:** VPS Único (DigitalOcean)
**Custo:** ~$50-80/mês

**Ações:**
1. Deploy em VPS usando `setup-vps-local.sh`
2. Implementar features core (Multicaixa Express)
3. Validar produto com primeiros usuários
4. Coletar métricas de uso

### Fase 2: Crescimento (Meses 4-12)
**Plataforma:** VPS Único (upgrade se necessário)
**Custo:** ~$100-150/mês

**Ações:**
1. Upgrade de VPS (16GB RAM, 8 vCPU) se precisar
2. Implementar Redis para caching
3. Cloudflare CDN para assets
4. Monitoramento robusto

### Fase 3: Escala (Ano 2+)
**Plataforma:** Considerar migração para GCP
**Custo:** ~$200-500/mês

**Ações:**
1. Avaliar necessidade de auto-scaling
2. Implementar múltiplas regiões se crescimento internacional
3. Migrar gradualmente para GCP
4. Manter arquitetura compatível (fácil migração)

---

## ⚖️ Decisão: VPS ou GCP?

### Use **VPS** se:

- [ ] Você está começando o projeto
- [ ] Orçamento limitado (<$100/mês)
- [ ] Time pequeno (1-3 pessoas)
- [ ] Menos de 5.000 usuários esperados
- [ ] Quer simplicidade e controle total
- [ ] Pode fazer manutenção manual do servidor
- [ ] Precisa iterar rápido e barato

### Use **GCP** se:

- [ ] Projeto já estabelecido
- [ ] Orçamento adequado (>$200/mês)
- [ ] Time com DevOps dedicado
- [ ] Mais de 10.000 usuários
- [ ] Precisa 99.99% uptime
- [ ] Precisa auto-scaling
- [ ] Distribuição geográfica necessária
- [ ] Compliance enterprise

---

## 🔄 Migração VPS → GCP

A arquitetura foi desenhada para permitir migração fácil:

### O que é compatível:
- ✅ Docker containers (mesma imagem)
- ✅ Variáveis de ambiente (.env)
- ✅ PM2 ecosystem config
- ✅ Nginx configuration
- ✅ Supabase (database não muda)
- ✅ Código da aplicação (identico)

### Processo de migração:
1. Testar deploy GCP em paralelo
2. Configurar Load Balancer no GCP
3. Apontar DNS para novo servidor
4. Monitorar por 48 horas
5. Desligar VPS antigo

**Tempo estimado:** 1-2 dias
**Downtime:** 0-5 minutos (apenas troca de DNS)

---

## 📝 Checklist de Decisão

Responda estas perguntas:

1. **Orçamento mensal disponível para infraestrutura?**
   - Menos de $100 → VPS ✅
   - Mais de $200 → GCP ou VPS

2. **Quantos usuários ativos você espera?**
   - Menos de 1.000 → VPS ✅
   - 1.000 - 10.000 → VPS
   - Mais de 10.000 → GCP

3. **Você tem time de DevOps?**
   - Não → VPS ✅
   - Sim → Ambos possíveis

4. **Precisa de 99.99% uptime?**
   - Não → VPS ✅
   - Sim → GCP

5. **Quanto tempo tem para setup?**
   - Menos de 1 dia → VPS ✅
   - Vários dias → Ambos possíveis

6. **Experiência com cloud?**
   - Pouca → VPS ✅
   - Muita → Ambos possíveis

**Se maioria das respostas aponta para VPS → Comece com VPS!**

---

## 🎯 Nossa Recomendação para Angola

### **COMECE COM VPS** (DigitalOcean)

**Razões:**

1. **Custo:** $48-80/mês vs $200+/mês
2. **Simplicidade:** Deploy em 40 minutos vs 3 horas
3. **Flexibilidade:** Fácil upgrade quando crescer
4. **Localização:** Data center Cape Town (baixa latência)
5. **Aprendizado:** Mais fácil entender a stack
6. **Validação:** Testar produto sem compromisso alto
7. **Migração:** Pode migrar para GCP depois se precisar

### Setup Inicial Recomendado:

```
Provedor: DigitalOcean
Plano: Basic Droplet
RAM: 8GB
CPU: 4 vCPU
Storage: 160GB SSD
Região: Cape Town (África do Sul)
OS: Ubuntu 22.04 LTS
Custo: $48/mês

+ Supabase Pro: $25/mês
+ Domínio: $1/mês
────────────────────
TOTAL: $74/mês

vs GCP: $213/mês
ECONOMIA: $139/mês (65%)
```

---

## 🚀 Começar Agora

### VPS (Recomendado):

```bash
# 1. Ler análise
cat VPS_ANALYSIS.md

# 2. Criar conta DigitalOcean
# https://www.digitalocean.com

# 3. Executar setup
./setup-vps-local.sh

# 4. Deploy em ~40 minutos!
```

### GCP (Alternativa):

```bash
# 1. Ler quick start
cat QUICK_START.md

# 2. Setup GCP
./setup-gcp.sh

# 3. Deploy
./deploy-backend.sh dev api

# 4. Deploy em ~2 horas
```

---

## 📚 Documentação Completa

- **VPS_ANALYSIS.md** - Análise detalhada VPS
- **VPS_DEPLOYMENT_GUIDE.md** - Guia VPS completo
- **DEPLOYMENT_GUIDE.md** - Guia GCP completo
- **QUICK_START.md** - Quick start GCP
- **README_DEPLOYMENT.md** - Índice GCP

---

## 💡 Dica Final

**Nossa recomendação:**

1. **Comece com VPS** (DigitalOcean $48/mês)
2. **Valide o produto** com usuários reais
3. **Colete métricas** de uso e performance
4. **Migre para GCP** apenas quando:
   - Ter >10.000 usuários ativos
   - Precisar auto-scaling
   - Orçamento permitir

**Não gaste em infraestrutura complexa antes de validar o produto!**

---

**Pronto para começar?** 🚀

Execute: `./setup-vps-local.sh`

Ou: `./setup-gcp.sh` (se preferir GCP)
