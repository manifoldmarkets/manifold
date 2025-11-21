# Manifold Angola - Simplificacao do Codebase

## Visao Geral

Este documento descreve as mudancas feitas para simplificar o Manifold Markets para o mercado Angolano. O objetivo foi criar uma versao mais leve e focada, mantendo apenas funcionalidades essenciais enquanto preserva a qualidade visual e profissional.

## Principais Mudancas

### 1. Autenticacao (Firebase -> Supabase)

**Removido:**
- Firebase Authentication
- Firebase Firestore
- Firebase Cloud Functions
- Todas as referencias ao Firebase

**Adicionado:**
- Supabase Auth com suporte a:
  - Login com Google OAuth
  - Login com telefone (OTP via SMS)

**Arquivos principais:**
- `web/lib/supabase/auth.ts` - Sistema de autenticacao
- `web/hooks/use-angola-auth.ts` - React hook para auth

### 2. Tipos de Mercado

**Removido:**
- Multiple Choice (multipla escolha)
- Numeric/Range markets
- Poll/Survey
- Stonk markets
- Bountied Questions
- Quadratic Funding

**Mantido:**
- **Mercados YES/NO (binarios)** - Unico tipo suportado

**Arquivos principais:**
- `common/src/types/angola-types.ts` - Tipos simplificados
- `common/src/calculate-cpmm-simple.ts` - AMM simplificado

### 3. Sistema de Moeda

**Removido:**
- Mana (play money)
- Spice points
- Sistema de conversao

**Adicionado:**
- **AOA (Angolan Kwanza)** - Moeda real
- Formatacao de moeda em Kwanzas
- Limites minimos configurados

**Configuracao:**
- `common/src/envs/angola.ts` - Configuracoes de moeda

### 4. Features Removidas

- Sistema de grupos/leagues
- Chat rooms e forums
- Notificacoes push
- Sistema de follows/followers complexo
- Feed algoritmico
- Trending e recomendacoes ML
- Sistema de reputacao elaborado
- Twitch bot
- Discord bot
- Aplicativos mobile nativos

### 5. API Simplificada

**Endpoints Essenciais:**

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| POST | /markets | Criar mercado YES/NO |
| GET | /markets | Listar mercados |
| GET | /markets/:id | Detalhes do mercado |
| POST | /markets/:id/resolve | Resolver mercado |
| POST | /bets | Fazer aposta |
| POST | /sell | Vender shares |
| GET | /user/me | Dados do usuario atual |
| GET | /user/portfolio | Portfolio do usuario |
| GET | /user/bets | Historico de apostas |

**Arquivos principais:**
- `backend/api/src/angola/routes.ts` - Definicao de rotas
- `backend/api/src/angola/server.ts` - Servidor Express
- `backend/api/src/angola/handlers/` - Handlers

### 6. Database Schema

**Novo schema SQL simplificado:**
- `supabase/schema.sql` - Schema completo para Supabase

**Tabelas principais:**
- `users` - Usuarios com saldo em AOA
- `markets` - Mercados YES/NO
- `bets` - Apostas
- `comments` - Comentarios
- `transactions` - Movimentacoes financeiras
- `notifications` - Notificacoes basicas

## Estrutura de Arquivos

```
manifold-PolyMarket-/
├── common/src/
│   ├── envs/angola.ts          # Configuracao Angola
│   ├── types/angola-types.ts   # Tipos simplificados
│   └── calculate-cpmm-simple.ts # AMM simplificado
│
├── backend/api/src/angola/
│   ├── routes.ts               # Rotas da API
│   ├── server.ts               # Servidor Express
│   └── handlers/
│       ├── market-handlers.ts  # Handlers de mercados
│       └── bet-handlers.ts     # Handlers de apostas
│
├── web/
│   ├── lib/supabase/auth.ts    # Autenticacao Supabase
│   ├── hooks/
│   │   ├── use-angola-auth.ts  # Hook de autenticacao
│   │   └── use-angola-api.ts   # Hook para API
│   └── components/angola/
│       ├── market-card.tsx     # Card de mercado
│       └── bet-panel.tsx       # Painel de apostas
│
├── supabase/
│   └── schema.sql              # Schema do database
│
└── docs/
    └── ANGOLA_SIMPLIFICATION.md # Esta documentacao
```

## Configuracao

### 1. Supabase

1. Criar projeto no Supabase
2. Executar `supabase/schema.sql` no SQL Editor
3. Configurar Auth providers (Google, Phone)
4. Atualizar `common/src/envs/angola.ts`:

```typescript
export const ANGOLA_CONFIG: AngolaEnvConfig = {
  supabaseInstanceId: 'SEU_INSTANCE_ID',
  supabaseAnonKey: 'SUA_ANON_KEY',
  // ...
}
```

### 2. Variaveis de Ambiente

```env
# Frontend (.env.local)
NEXT_PUBLIC_SUPABASE_INSTANCE_ID=xxx
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
NEXT_PUBLIC_API_ENDPOINT=api.seudominio.com

# Backend
SUPABASE_INSTANCE_ID=xxx
SUPABASE_SERVICE_KEY=xxx
PORT=8080
```

### 3. Deploy

**Frontend (Vercel):**
```bash
cd web
vercel deploy
```

**Backend (Docker/Cloud Run):**
```bash
cd backend
docker build -t angola-api .
docker run -p 8080:8080 angola-api
```

## AMM (Automated Market Maker)

O sistema usa CPMM (Constant Product Market Maker) simplificado:

**Formula:** `y^p * n^(1-p) = k`

Onde:
- `y` = Shares YES no pool
- `n` = Shares NO no pool
- `p` = Constante de probabilidade
- `k` = Produto constante

**Funcoes principais:**
- `getCpmmProbability()` - Probabilidade atual
- `calculateCpmmShares()` - Shares por aposta
- `calculateBet()` - Calculo completo de aposta
- `calculateSell()` - Calculo de venda

## Taxas

Configuradas em `common/src/envs/angola.ts`:

```typescript
platformFeePercent: 2.0,  // 2% para plataforma
creatorFeePercent: 1.0,   // 1% para criador
```

## Limites

```typescript
minBetAmount: 100,           // Aposta minima: 100 Kz
minMarketCreationAmount: 5000, // Criar mercado: 5000 Kz
minDeposit: 500,             // Deposito minimo
minWithdrawal: 1000,         // Saque minimo
```

## Seguranca

### Row Level Security (RLS)

Todas as tabelas tem RLS ativado no Supabase:
- Usuarios podem ver dados publicos
- Usuarios so podem modificar seus proprios dados
- Transacoes so visiveis ao proprio usuario

### Validacao

- Schemas Zod para validacao de input
- Verificacao de saldo antes de operacoes
- Locking otimista para prevenir race conditions

## Proximos Passos

1. **Integracao de Pagamentos**
   - Integrar com gateway de pagamento angolano
   - Implementar depositos/saques

2. **Verificacao KYC**
   - Verificacao de identidade para usuarios
   - Limites baseados em nivel de verificacao

3. **Mobile App**
   - PWA otimizado para mobile
   - Ou app nativo simplificado

4. **Monitoramento**
   - Setup de logging
   - Metricas de uso
   - Alertas de erro

## Contato

Para questoes sobre a simplificacao, consulte a equipe de desenvolvimento.
