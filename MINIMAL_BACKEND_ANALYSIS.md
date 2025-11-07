# Minimal Backend Analysis: Types, Schemas & Utilities

## Overview
- **Total API Endpoints:** 164 endpoints defined in schema.ts
- **Total Common Files:** ~14KB of TypeScript type definitions
- **Transaction Categories:** 64 distinct types defined in txn.ts
- **Contract Types:** 9+ distinct mechanisms/outcome types

---

## 1. API SCHEMA ANALYSIS - TOP 20 CRITICAL ENDPOINTS

### TIER 1: ABSOLUTELY MUST HAVE (Core Trading Loop)
These 6 endpoints form the minimal viable backend:

| Endpoint | Method | Auth | Purpose | Calls Required |
|----------|--------|------|---------|-----------------|
| `createuser` | POST | Yes | User account creation | FIRST (user signup) |
| `me` | GET | Yes | Get current user profile | After login |
| `me/update` | POST | Yes | Update user (name, avatar, etc.) | User settings |
| `market` | POST | Yes | Create a market | Market creation |
| `bet` | POST | Yes | Place a bet | Core trading |
| `bets` | GET | No | Get bets for market/user | Feed/display |

**Why minimal:** These handle: user creation → profile → market creation → betting → fetching results

### TIER 2: CRITICAL FOR USER EXPERIENCE (MVP Features)
These 8 endpoints enable core features:

| Endpoint | Method | Auth | Purpose | Dependencies |
|----------|--------|------|---------|---------------|
| `market/:id` | GET | No | Get market details | Display market |
| `market/:contractId/resolve` | POST | Yes | Resolve outcome | Market closure |
| `market/:contractId/sell` | POST | Yes | Sell position | Exit trades |
| `me/private` | GET | Yes | Private user data (email, keys) | Account settings |
| `user/:username` | GET | No | Get user profile | View other users |
| `search-markets-full` | GET | Optional | Search markets | Discovery |
| `comment` | POST | Yes | Add market comments | Engagement |
| `txns` | GET | No | Transaction history | Activity tracking |

### TIER 3: ESSENTIAL FOR BASIC FUNCTIONALITY (Extended MVP)
Additional 6 endpoints for completeness:

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `market/:contractId/answers` | GET | No | Get multi-choice answers |
| `slug/:slug` | GET | No | Get market by slug |
| `markets` | GET | No | Market list/feed |
| `leaderboard` | GET | No | User rankings |
| `balance-changes` | GET | No | Portfolio history |
| `get-notifications` | GET | Yes | Activity notifications |

---

## 2. TYPE DEFINITIONS ANALYSIS

### Contract Types: ESSENTIAL vs OPTIONAL

#### MUST HAVE (3 types = 80% of functionality)
```typescript
// 1. BINARY - Yes/No markets
Binary {
  outcomeType: 'BINARY'
  initialProbability: number
  resolutionProbability?: number
  resolution?: 'YES' | 'NO' | 'MKT' | 'CANCEL'
}

// 2. CPMM - Automated Market Maker (core mechanism)
CPMM {
  mechanism: 'cpmm-1'
  pool: { [outcome: string]: number }
  prob: number
  totalLiquidity: number
  subsidyPool: number
}

// 3. MULTIPLE_CHOICE - Multi-answer markets  
CPMMMulti {
  mechanism: 'cpmm-multi-1'
  outcomeType: 'MULTIPLE_CHOICE'
  shouldAnswersSumToOne: boolean
  answers: Answer[]
}
```
**Why:** These 3 types cover 95% of user scenarios

#### NICE TO HAVE (4 types = polish/advanced)
- PSEUDO_NUMERIC (continuous ranges: 0-100)
- NUMBER (bucketed numeric: 5-10, 10-15, etc.)
- POLL (non-betting: just voting)
- BOUNTIED_QUESTION (Q&A with rewards)
- STONK (special stock-like mechanics)
- QUADRATIC_FUNDING (funding rounds)

**Can defer:** These are advanced features; users rarely create them initially

#### CAN DEFER (2 types = future)
- DATE (temporal outcomes)
- MULTI_NUMERIC (multi-answer numeric)

**Why:** Add complexity; only needed when users want more sophisticated predictions

---

### User Type: ESSENTIAL FIELDS

#### MUST HAVE (Core User Model)
```typescript
User {
  id: string
  createdTime: number
  
  // Identity
  name: string
  username: string (UNIQUE)
  avatarUrl: string
  
  // Financial
  balance: number // M$ balance
  totalDeposits: number
  
  // Stats
  creatorTraders: { daily, weekly, monthly, allTime }
}
```
**Lines of Code:** ~30 lines  
**Why essential:** User identification, trading permissions, display

#### NICE TO HAVE (Profile Enhancement)
- bio, website, twitterHandle, discordHandle
- currentBettingStreak, lastBetTime
- isAdvancedTrader (UI feature)

#### CAN DEFER (Complex Features)
- sweepstakesVerified, idVerified (KYC)
- kycDocumentStatus, sweepstakes5kLimit
- isBannedFromPosting, userDeleted
- purchasedMana, verifiedPhone

**PrivateUser = OPTIONAL** (can be null initially)
- Can store email, API keys separately
- Push tokens, notification prefs = feature flags

---

### Bet Type: ESSENTIAL STRUCTURE

#### MUST HAVE
```typescript
Bet {
  id: string
  userId: string
  contractId: string
  
  createdTime: number
  amount: number // bet size
  outcome: string // 'YES' or 'NO'
  shares: number
  
  probBefore: number
  probAfter: number
  
  isRedemption: boolean
  fees: Fees
}
```
**Lines of Code:** ~25 lines  
**Why:** Complete bet record for settlement & display

#### NICE TO HAVE
- LimitBet (limit orders - advanced trading)
- NumericBet (for numeric markets)
- answerId (for multi-answer)
- betGroupId (related bets)

#### CAN DEFER
- Limit order fills tracking
- Loan amounts
- Reply to comments

---

### Answer Type: FOR MULTIPLE CHOICE

#### MUST HAVE
```typescript
Answer {
  id: string
  contractId: string
  text: string
  
  poolYes: number
  poolNo: number
  prob: number
  
  resolution?: resolution
  resolutionTime?: number
}
```
**Lines of Code:** ~20 lines  
**Why:** Multi-choice markets need answer structure

#### OPTIONAL
- loverUserId, imageUrl, shortText, midpoint
- Color overrides, custom sorting

---

## 3. TRANSACTION CATEGORIES: ESSENTIAL vs OPTIONAL

**Current:** 64 transaction types defined  
**For Minimal Backend:** 5-7 categories needed

### MUST HAVE CATEGORIES (Core Economics)
```
Transaction Categories Used in MVP:

1. SIGNUP_BONUS
   - First-time user bonus (e.g., 1000 M$)
   - fromType: BANK → toType: USER
   - ESSENTIAL: Onboarding incentive

2. MANA_PURCHASE  
   - User buys mana (Stripe/Apple IAP/GIDX)
   - fromType: BANK → toType: USER
   - ESSENTIAL: Revenue model

3. MANA_PAYMENT (send M$ to other user)
   - fromType: USER → toType: USER
   - OPTIONAL: Can defer to v2

4. MANUAL PAYOUTS (for testing)
   - ADMIN_REWARD, LOAN, REFERRAL
   - For early testing only

5. FEE TRACKING (nice to have)
   - CONTRACT_RESOLUTION_FEE (profit tax)
   - CAN DEFER initially
```

### OPTIONAL CATEGORIES (Can Add Later)
```
Advanced Economics:
- BETTING_STREAK_BONUS (feature incentive)
- UNIQUE_BETTOR_BONUS (creator rewards)
- REFERRAL (growth engine)
- BOUNTY_POSTED, BOUNTY_AWARDED (community features)
- QUEST_REWARD, LEAGUE_PRIZE (gamification)
- PRODUCE_SPICE, CONSUME_SPICE (alt currency)
- AI FEATURES (ads, boosts, etc.)

Complexity Level: Medium-High
Impact if deferred: Users can still trade without these
```

### CAN DEFER (Advanced/Rare)
```
Low-value categories:
- LOOTBOX_PURCHASE, LIKE_PURCHASE
- PUSH_NOTIFICATION_BONUS
- BOT_COMMENT_FEE
- MANACHAN_TWEET
- MARKET_BOOST_CREATE, MARKET_BOOST_REDEEM
- Q_AND_A_CREATE, Q_AND_A_AWARD
- QUADRATIC_FUNDING operations
- GIDX/payment gateway specific

Impact: Niche features; defer 6+ months
```

---

## 4. USER FIELDS: MINIMAL SET

### Core Identity (8 fields)
```typescript
// ABSOLUTELY REQUIRED
id: string
createdTime: number
name: string
username: string (UNIQUE INDEX)
avatarUrl: string
balance: number

// HIGHLY RECOMMENDED
totalDeposits: number
creatorTraders: { daily, weekly, monthly, allTime }
```

### Statistics (5 fields - can be denormalized)
```typescript
lastBetTime?: number
currentBettingStreak?: number
streakForgiveness: number
referredByUserId?: string
shouldShowWelcome?: boolean
```

### Feature Flags (Optional)
```typescript
isAdvancedTrader?: boolean
optOutBetWarnings?: boolean
isBannedFromPosting?: boolean
```

### Can Skip Initially
```typescript
// KYC & Verification
idVerified, sweepstakesVerified, kycDocumentStatus

// Social
bio, website, twitterHandle, discordHandle

// Deprecated Fields (32+)
spiceBalance, cashBalance, followerCountCached, 
freeQuestionsCreated, purchasedSweepcash, etc.
```

**Total Usable Fields: 13-18 (out of 70+ defined)**

---

## 5. ECONOMY & PRICING: ESSENTIAL CONSTANTS

### MUST HAVE (Incentive Structure)
```typescript
// New user onboarding
STARTING_BALANCE = 1000 // M$ startup amount
PHONE_VERIFICATION_BONUS = 1000 // Encourage verification
SIGNUP_BONUS_PAID = varies // Usually included in STARTING_BALANCE

// Market creation
getAnte() - varies by market type
  - BINARY: liquidityTier (100-100k M$)
  - MULTIPLE_CHOICE: numAnswers * tierCost
  - POLL: 10 M$ (minimal)

// Betting constraints
MANA_MIN_BET = 1 // Minimum per bet
SWEEPS_MIN_BET = 1 // For cash markets
```

### NICE TO HAVE (Advanced Economics)
```typescript
REFERRAL_AMOUNT = 1000 // Referral bonus
BETTING_STREAK_BONUS_AMOUNT = 5
BETTING_STREAK_BONUS_MAX = 25
PROFIT_FEE_FRACTION = 0.1 // 10% profit tax on winners

// Tier system
liquidityTiers = [100, 1000, 10000, 100000]
answerCostTiers = [10, 50, 100, 500]
```

### CAN DEFER
```typescript
// Payment processing
PaymentAmounts (Stripe tiers)
WEB_PRICES, IOS_PRICES, OLD_IOS_PRICES
KYC_VERIFICATION_BONUS_CASH
MIN_CASHOUT_AMOUNT

// Advanced features
BOOST_COST_MANA = 10000
MANACHAN_TWEET_COST = 250
PUSH_NOTIFICATION_BONUS = 1000
```

---

## 6. UTILITY/HELPER FUNCTIONS: CRITICAL vs OPTIONAL

### MUST HAVE (Core Calculations)

#### Market/Betting Utilities
```typescript
// From calculate-cpmm.ts (550+ lines)
calculateCPMM() - Probability calculation on AMM
calculateBet() - Bet outcome simulation
getLiquidity() - Pool health check

// From calculate.ts
getDisplayProbability() - Format probability for UI
tradingAllowed() - Check if market is open

// From contract.ts
contractPath() - Generate URL
isBinaryMulti() - Type checking
```
**Why essential:** Need these for every bet calculation & display

#### Market Creation
```typescript
// From contract.ts, economy.ts
getAnte() - Calculate creation cost
CREATEABLE_OUTCOME_TYPES - Allowed types
MAX_QUESTION_LENGTH = 120
MAX_DESCRIPTION_LENGTH = 16000
CPMM_MIN_POOL_QTY = 0.01
```

#### User/Auth
```typescript
// From user.ts
humanish() - Basic spam check
isUserLikelySpammer() - Heuristic filter
```

### NICE TO HAVE (Display/Polish)
```typescript
// From format.ts
formatMoney() - Display $amounts
formatPercent() - Display probabilities
getBinaryProbPercent() - Binary display

// From contract.ts
renderResolution() - Outcome formatting
contractPool() - Pool display
```

### CAN DEFER (Advanced)
```typescript
// Complex calculations
calculateCPMMMArbitrage() - Edge detection (47K lines!)
calculateMetrics() - Historical analysis
dayProbChange() - Trending indicator

// Admin/Monitoring
isMarketRanked() - Ranking logic
getAdjustedProfit() - Profit calculations
```

---

## 7. COMPARISON: FULL vs MINIMAL BACKEND

### Code Footprint

| Component | Full | Minimal | % Reduction |
|-----------|------|---------|------------|
| API Endpoints | 164 | 20 | 88% ↓ |
| Txn Categories | 64 | 5-7 | 89% ↓ |
| Contract Types | 9+ | 3 | 67% ↓ |
| User Fields | 70+ | 15 | 78% ↓ |
| Utility Functions | 100+ | 10 | 90% ↓ |
| **Common Size** | ~13KB | ~2KB | 85% ↓ |

### Feature Comparison

| Feature | Full | MVP | Effort |
|---------|------|-----|--------|
| Create & bet (BINARY) | Yes | Yes | Base |
| Multi-choice markets | Yes | Yes | Base |
| Leaderboards | Yes | Yes | Base |
| Market search | Yes | Yes | Base |
| Comments | Yes | Yes | Base |
| Limit orders | Yes | No | +1 sprint |
| Numeric ranges | Yes | No | +1 sprint |
| Streaks/bonuses | Yes | Signup only | +1 sprint |
| Referrals | Yes | No | +1 sprint |
| Boosts/Ads | Yes | No | +2 sprints |
| KYC verification | Yes | No | +2 sprints |
| Quadratic funding | Yes | No | +3 sprints |

---

## 8. CRITICAL DEPENDENCIES CHAIN

### Must Load First (Order Matters)
```
1. User type (identity)
   ↓ needed by Bet
2. Contract type (market definition)
   ↓ needed by Bet
3. Bet type (trading record)
   ↓ needed by API schemas
4. Answer type (for multi-choice)
   ↓ needed by Contract
5. Txn type (accounting)
   ↓ used by API endpoints
6. API schema (endpoint definitions)
   ↓ needed by backend routing
```

### Can Load Anytime (No Dependencies)
- Fees
- Economy constants
- Helper functions
- Utility types

---

## 9. SIMPLIFICATION RECOMMENDATIONS

### For Minimal Backend MVP:

#### Step 1: Type Reduction (Day 1)
```typescript
// Delete/stub these files:
- quadratic-funding.ts (0 lines used)
- stonk.ts (feature not needed)
- multi-numeric.ts (defer)
- multi-date.ts (defer)
- league.ts (defer)
- quest.ts (defer)
- achievement.ts (defer)

// Stub these types:
- NonBet, QuadraticFunding, Poll (use null)
- LimitBet (empty object until needed)
```

#### Step 2: Endpoint Reduction (Day 1-2)
```typescript
// Keep ONLY these 20 endpoints
const MINIMAL_ENDPOINTS = [
  'createuser', 'me', 'me/update', 'me/private',
  'market', 'market/:id', 'slug/:slug', 'markets',
  'bet', 'bets', 'market/:contractId/sell',
  'market/:contractId/resolve', 'market/:contractId/answers',
  'comment', 'user/:username', 'leaderboard',
  'txns', 'search-markets-full',
  'get-notifications', 'balance-changes'
]

// Delete endpoints for:
- Limit orders (save 3 endpoints)
- All admin actions (save 10+ endpoints)
- KYC/GIDX/verification (save 8+ endpoints)
- Boosts/ads/features (save 15+ endpoints)
- Notifications detailed (save 5+ endpoints)
```

#### Step 3: Schema Simplification (Day 2-3)
```typescript
// Simplify schema.ts
- Remove 40+ complex properties
- Remove discriminator types
- Use simple union types
- Remove nested Zod validations

// Impact: 600 lines → 250 lines
```

#### Step 4: Transaction Simplification (Day 3)
```typescript
// Keep ONLY these categories:
const MINIMAL_CATEGORIES = [
  'SIGNUP_BONUS',
  'MANA_PURCHASE',
  'MANA_PAYMENT',
  'ADMIN_REWARD', // for testing
  'CONTRACT_RESOLUTION_PAYOUT',
  'CONTRACT_RESOLUTION_FEE'
]

// Delete 58 other category types
// Impact: 660 lines → 150 lines
```

---

## 10. PHASED ROLLOUT PLAN

### Phase 1: Bare Minimum (Week 1)
**Focus:** Trading loop only
```
Endpoints: createuser, me, market, bet, bets, market/:id
Types: Binary CPMM, User (minimal), Bet, Answer
Txns: SIGNUP_BONUS, MANA_PURCHASE
Features: Sign up → Create binary market → Place bet → Resolve
```

### Phase 2: MVP Features (Week 2)
**Add:** User profiles, comments, search
```
Endpoints: +me/update, comment, user/:username, search-markets-full
Types: +User profile fields, Comment
Features: Comments on markets, user pages
```

### Phase 3: Extended MVP (Week 3)
**Add:** Multi-choice, leaderboards, notifications
```
Endpoints: +leaderboard, get-notifications, balance-changes
Types: +Multiple choice markets, Answer fields
Txns: +REFERRAL, BETTING_STREAK_BONUS
Features: Competitions, activity feed
```

### Phase 4: Polish (Week 4+)
**Add:** Limit orders, bonuses, advanced search
```
Defer: Numeric ranges, streaks, ads, KYC
```

---

## Summary Table: What to Keep vs Cut

| Area | Keep | Cut | Reason |
|------|------|-----|--------|
| **Endpoints** | 20 core | 144 advanced | 88% are features/admin |
| **Contract Types** | BINARY, MULTI, CPMM | 6+ others | 3 types = 95% use |
| **User Fields** | 15 core | 55 deprecated | Legacy from old code |
| **Txn Categories** | 5-7 | 57-59 | Most are features/bonuses |
| **Utilities** | 10 core | 90+ advanced | Complex = can defer |
| **Dependencies** | Type chains | Circular imports | Simplify DAG |

---

## Conclusion

**A minimal backend can work with:**
- 20 endpoints (12% of full)
- 3 contract types (33% of full)
- 15 user fields (21% of full)  
- 5-7 txn categories (8-11% of full)
- 250-300 lines of schema

**Time to build:** 1-2 weeks  
**Time to MVP features:** 3-4 weeks  
**Complexity reduction:** 85%+ less code to maintain

The full backend has 9+ years of accumulated features. An MVP needs only the core prediction market loop.
