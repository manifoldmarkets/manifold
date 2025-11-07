# Minimal Backend - Quick Reference Card

## TIER 1: ABSOLUTELY MUST HAVE (6 endpoints)
```
createuser → me → market → bet → bets → (resolve + results)

MUST HAVE TYPES:
- User {id, name, username, avatarUrl, balance}
- Contract {id, question, mechanism:CPMM, outcomeType:BINARY}
- Bet {id, userId, contractId, amount, outcome, shares, fees}
- Answer (for multi-choice only)

TRANSACTIONS NEEDED:
- SIGNUP_BONUS (startup M$)
- MANA_PURCHASE (revenue)
- CONTRACT_RESOLUTION_PAYOUT (settlement)
- CONTRACT_RESOLUTION_FEE (profit tax)
```

## TIER 2: FOR MVP USER EXPERIENCE (8 endpoints)
```
+ market/:id (view market)
+ market/:contractId/resolve (finish market)
+ market/:contractId/sell (exit position)
+ me/private (settings)
+ user/:username (view profile)
+ search-markets-full (find markets)
+ comment (engage)
+ txns (activity)
```

## TIER 3: EXTENDED MVP (6 endpoints)
```
+ market/:contractId/answers (multi-choice)
+ slug/:slug (friendly URLs)
+ markets (feed)
+ leaderboard (rankings)
+ balance-changes (portfolio)
+ get-notifications (alerts)
```

---

## CORE TYPE DEFINITIONS (Minimal)

### Contract
```typescript
type Contract = {
  id: string
  slug: string
  creatorId: string
  question: string
  description: string
  
  // Market mechanics
  mechanism: 'cpmm-1'  // Only support Automated Market Maker
  outcomeType: 'BINARY' | 'MULTIPLE_CHOICE'  // Only these 2
  
  // State
  createdTime: number
  closeTime?: number
  isResolved: boolean
  resolution?: 'YES' | 'NO' | 'MKT' | 'CANCEL'
  
  // Probability
  prob: number
  
  // Liquidity
  pool: {YES: number, NO: number}
  totalLiquidity: number
  
  // Stats
  volume: number
  uniqueBettorCount: number
  
  token: 'MANA'  // Only support Mana for MVP
}
```

### User
```typescript
type User = {
  id: string
  createdTime: number
  
  name: string
  username: string  // UNIQUE INDEX
  avatarUrl: string
  
  balance: number  // M$
  totalDeposits: number
  
  creatorTraders: {
    daily: number
    weekly: number
    monthly: number
    allTime: number
  }
  
  // Optional but recommended
  lastBetTime?: number
  currentBettingStreak?: number
}
```

### Bet
```typescript
type Bet = {
  id: string
  userId: string
  contractId: string
  answerId?: string  // For multi-choice
  
  createdTime: number
  amount: number
  outcome: string  // 'YES' or 'NO'
  shares: number
  
  probBefore: number
  probAfter: number
  
  fees: {
    creator: number
    platform: number
    liquidity: number
  }
  
  isRedemption: boolean
}
```

### Answer (Only needed for multi-choice)
```typescript
type Answer = {
  id: string
  contractId: string
  text: string
  
  poolYes: number
  poolNo: number
  prob: number
  
  resolution?: 'YES' | 'NO'
  resolutionTime?: number
}
```

---

## ECONOMY CONSTANTS

### User Onboarding
```typescript
STARTING_BALANCE = 1000  // M$ given to new user
```

### Market Creation Costs
```typescript
BINARY_ANTE = 100      // M$ to create binary
MULTI_ANTE = 500       // M$ to create multi-choice
```

### Betting Rules
```typescript
MIN_BET = 1            // M$ minimum bet size
MAX_PROB = 0.99        // Can't bet to 99.9%
MIN_PROB = 0.01        // Can't bet to 0.1%
```

### Fees
```typescript
CREATOR_FEE = 0.01     // 1% to market creator
PLATFORM_FEE = 0.01    // 1% to platform
LIQUIDITY_FEE = 0.003  // 0.3% to liquidity
```

---

## API ENDPOINT SIGNATURES (Minimal)

### User Management
```
POST /createuser
  → {user: User, privateUser: PrivateUser}

GET /me
  → User

POST /me/update {name?, username?, avatarUrl?, bio?}
  → User
```

### Market CRUD
```
POST /market {question, description, ...}
  → Contract

GET /market/:id
  → Contract

GET /slug/:slug
  → Contract
```

### Trading
```
POST /bet {contractId, amount, outcome}
  → Bet

GET /bets {contractId?, userId?, limit}
  → Bet[]

POST /market/:contractId/sell {outcome, shares?}
  → Bet

POST /market/:contractId/resolve {resolution, resolutionProbability?}
  → {success: true}
```

### Browsing
```
GET /markets {limit?, sort?, order?}
  → Contract[]

GET /search-markets-full {term?, limit?}
  → Contract[]

GET /user/:username
  → User

GET /leaderboard {kind, limit?, token?}
  → [{userId, score}]
```

### Activity
```
POST /comment {contractId, content, html?}
  → Comment

GET /txns {userId?, contractId?, limit?}
  → Txn[]

GET /balance-changes {userId}
  → BalanceChange[]
```

---

## TRANSACTION TYPES NEEDED

```typescript
type AnyTxnType =
  | SignupBonus        // BANK → USER (onboarding)
  | ManaPurchase       // BANK → USER (revenue)
  | ManaPay            // USER → USER (transfers)
  | ContractResolution // CONTRACT → USER (settlement)
  | ContractFee        // USER → BANK (profit tax)
```

---

## DEPENDENCY ORDER (Load in this order)

1. Common utilities (fees, constants)
2. User type
3. Contract type + Answer type
4. Bet type
5. Txn type
6. API schema
7. Helper functions

---

## FILES TO DELETE (MVP)

```
❌ achievement.ts
❌ bounty.ts
❌ chat-message.ts
❌ charity.ts
❌ league.ts
❌ liquidity-provision.ts
❌ poll-option.ts
❌ quest.ts
❌ repost.ts
❌ stonk.ts
❌ topic.ts
❌ all calculate-cpmm-arbitrage.ts
❌ all gidx/ folder
❌ all supabase/ folder (initially)
```

---

## ENDPOINTS TO KEEP (20 total)

```javascript
const MINIMAL_API = [
  // User (4)
  'createuser',
  'me',
  'me/update',
  'me/private',
  
  // Markets (4)
  'market',
  'market/:id',
  'slug/:slug',
  'markets',
  
  // Trading (4)
  'bet',
  'bets',
  'market/:contractId/sell',
  'market/:contractId/resolve',
  
  // Content (2)
  'comment',
  'market/:contractId/answers',
  
  // Browse (2)
  'user/:username',
  'search-markets-full',
  
  // Activity (2)
  'leaderboard',
  'txns',
]
```

---

## SUCCESS METRICS FOR MVP

### Can Users Do This?
- [ ] Sign up with username/password
- [ ] Create a binary market
- [ ] Place a bet (YES/NO)
- [ ] Sell shares
- [ ] See market probability update
- [ ] See leaderboard
- [ ] View their balance
- [ ] View market history
- [ ] Comment on markets

### Code Metrics
- [ ] < 300 lines schema.ts
- [ ] < 150 lines txn.ts (just types)
- [ ] < 50 lines economy.ts
- [ ] 3 contract types max
- [ ] 15 user fields max
- [ ] 6 txn categories max

---

## TIMELINE

| Phase | Days | Endpoints | Features |
|-------|------|-----------|----------|
| Core Loop | 3 | 6 | Sign up → Bet → Resolve |
| MVP Basics | 2 | +8 | Profiles, Comments, Search |
| Extended | 2 | +6 | Multi-choice, Leaderboard |
| Polish | 3 | +5 | Limits, Notifications, Bonuses |

**Total: 2 weeks for solid MVP**

