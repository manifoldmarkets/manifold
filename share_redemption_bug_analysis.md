# Share Redemption Bug Analysis for cpmm-multi-1 Contracts

## Issue Summary

A user on a cpmm-multi-1 contract (where answers sum to one) experienced incomplete share redemption. After initially successful redemptions, subsequent NO bets were not properly redeeming existing YES shares, causing the user to lose money on what should have been profitable arbitrage opportunities.

## Root Cause

The bug is in `backend/api/src/redeem-shares.ts` at line 53. The condition that determines which redemption logic to use is:

```typescript
if (contract.outcomeType === 'NUMBER') {
    // Use multi-answer redemption logic
} else {
    // Use binary redemption logic (INCORRECT for sum-to-one markets)
}
```

### The Problem

1. **Contract Type Confusion**: The code assumes only contracts with `outcomeType === 'NUMBER'` need multi-answer redemption logic
2. **Missing Case**: cpmm-multi-1 contracts with `shouldAnswersSumToOne: true` but `outcomeType: 'MULTIPLE_CHOICE'` are incorrectly routed to binary redemption logic
3. **Limited Binary Logic**: The binary redemption logic (lines 121-158) only handles same-answer redemptions and doesn't understand cross-answer arbitrage

### Why It Partially Worked

- Initial redemptions worked because binary logic can handle direct YES/NO cancellations on the same answer
- Cross-answer redemptions failed because binary logic doesn't understand that YES shares in answer A should redeem against NO shares in answers B, C, D in sum-to-one markets

## The Mechanics of Sum-to-One Markets

In markets where answers sum to one:
- Having YES shares in answer A is equivalent to having NO shares in all other answers
- When buying NO shares in answer A while holding YES shares in answer B, the system should:
  1. Buy NO shares in answer A
  2. Simultaneously redeem the equivalent YES shares from answer B
  3. This maintains the sum-to-one constraint and provides arbitrage opportunities

## Current vs. Correct Logic

### Current (Buggy) Logic
```typescript
// Line 53 in redeem-shares.ts
if (contract.outcomeType === 'NUMBER') {
    // Multi-answer redemption with cross-answer arbitrage
} else {
    // Binary redemption (no cross-answer understanding)
}
```

### Correct Logic
```typescript
if (contract.outcomeType === 'NUMBER' || 
    (contract.mechanism === 'cpmm-multi-1' && contract.shouldAnswersSumToOne)) {
    // Multi-answer redemption with cross-answer arbitrage
} else {
    // Binary redemption
}
```

## Evidence from Code

1. **Contract Type Definitions** (`common/src/contract.ts`):
   - `CPMMNumber`: `outcomeType: 'NUMBER'` + `shouldAnswersSumToOne: true`
   - `CPMMMulti`: `outcomeType: 'MULTIPLE_CHOICE'` + `shouldAnswersSumToOne: boolean`

2. **Betting Logic** (`common/src/new-bet.ts` line 154):
   ```typescript
   if (contract.shouldAnswersSumToOne) {
       return getNewMultiCpmmBetsInfoSumsToOne(...)
   }
   ```
   The betting logic correctly checks `shouldAnswersSumToOne`, not just `outcomeType`.

3. **Arbitrage Logic** (`common/src/calculate-cpmm-arbitrage.ts`):
   The entire arbitrage calculation system is built around `shouldAnswersSumToOne` markets, not just NUMBER contracts.

## Impact

- Users lose money on what should be profitable arbitrage opportunities
- Market inefficiency as prices don't properly converge
- Inconsistent behavior between similar contract types
- User confusion and potential loss of trust

## Fix Required

Change line 53 in `backend/api/src/redeem-shares.ts` from:
```typescript
if (contract.outcomeType === 'NUMBER') {
```

To:
```typescript
if (contract.outcomeType === 'NUMBER' || 
    (contract.mechanism === 'cpmm-multi-1' && contract.shouldAnswersSumToOne)) {
```

This ensures that all sum-to-one markets use the proper multi-answer redemption logic that handles cross-answer arbitrage correctly.