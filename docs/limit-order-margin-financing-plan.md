# Limit Order Margin Financing Implementation Plan

## Overview

This feature allows users to place limit orders that can be financed by margin loans when filled. When the limit order is filled and the user has insufficient balance, the system automatically takes out a margin loan for the missing amount.

## Requirements

1. **Access Control**: Only users with margin loan access (subscribers) can use this feature
2. **UI**: Toggle in the limit order panel to enable margin financing
3. **Disabled State**: Toggle is disabled for non-subscribers with a tooltip explaining why
4. **Automatic Loan**: When a margin-financed limit order is about to be filled and user has insufficient balance, take out a margin loan
5. **Same Loan Mechanism**: Use the exact same margin loan mechanism (limits, eligibility, distribution) as the existing loans modal

## Implementation Steps

### Phase 1: Database Schema Changes

1. **Add `marginFinanced` field to `contract_bets` table**
   - File: `backend/supabase/contract_bets.sql` (or migration)
   - Add column: `margin_financed boolean default false`
   - This field indicates the limit order can be filled using margin loans

### Phase 2: API Schema Changes

1. **Update bet API schema**
   - File: `common/src/api/schema.ts`
   - Add optional `marginFinanced: z.boolean().optional()` to the `bet` props

2. **Update Bet type**
   - File: `common/src/bet.ts`
   - Add `marginFinanced?: boolean` to `LimitProps`

### Phase 3: Backend Logic Changes

1. **Modify `place-bet.ts`**
   - File: `backend/api/src/place-bet.ts`
   - Pass `marginFinanced` flag through to the bet data
   - Store the flag on unfilled limit orders

2. **Modify `helpers/bets.ts` - Core filling logic**
   - File: `backend/api/src/helpers/bets.ts`
   - In `updateMakers()`, before deducting balance from makers:
     - Check if each maker has sufficient balance
     - If not and their limit order has `marginFinanced: true`:
       - Check if user still has margin loan access
       - Check if user is eligible for a loan (equity, daily limits)
       - Calculate the missing amount
       - Take out a margin loan using the same mechanism as `request-loan.ts`
       - Only then proceed with the fill
     - If not eligible or loan fails, skip that maker's fill (like insufficient balance)

3. **Create helper for margin loan on fill**
   - File: `backend/api/src/helpers/margin-loan-on-fill.ts` (new)
   - Helper function that:
     - Checks user's entitlements for margin loan access
     - Calculates available loan capacity
     - Takes out loan if possible
     - Returns success/failure

4. **Update `fetchContractBetDataAndValidate`**
   - File: `backend/api/src/helpers/bets.ts`
   - Include `margin_financed` field when fetching limit orders
   - Include maker's entitlements (or cache this check)

### Phase 4: Frontend Changes

1. **Add hook for margin loan access**
   - File: `web/hooks/use-margin-loan-access.ts` (new or extend existing)
   - Check if user has margin loan access from entitlements

2. **Update LimitOrderPanel component**
   - File: `web/components/bet/limit-order-panel.tsx`
   - Add toggle for "Finance with margin loan"
   - Check subscription status to enable/disable toggle
   - Show tooltip on disabled toggle: "Requires Manifold membership"
   - Pass `marginFinanced` flag to the API call

3. **Add UI components**
   - Toggle component with tooltip
   - Info text explaining the feature

### Phase 5: Notifications & Logging

1. **Add notification for margin loan taken on fill**
   - Notify user when their limit order was filled using a margin loan
   - Include amount borrowed

2. **Add logging**
   - Log margin loan events for debugging

## Detailed Component Changes

### `common/src/api/schema.ts`
```typescript
bet: {
  props: z.object({
    // ... existing fields
    marginFinanced: z.boolean().optional(), // NEW
  })
}
```

### `common/src/bet.ts`
```typescript
type LimitProps = {
  // ... existing fields
  marginFinanced?: boolean // NEW: indicates this order can be filled with margin loan
}
```

### `web/components/bet/limit-order-panel.tsx`
```tsx
// Add state for margin financing toggle
const [marginFinanced, setMarginFinanced] = useState(false)

// Check if user can access margin loans
const hasMarginLoanAccess = canAccessMarginLoans(userEntitlements)

// In the UI, add toggle before the submit button:
<Row className="items-center justify-between">
  <label className="flex items-center gap-2">
    <Toggle
      on={marginFinanced}
      setOn={setMarginFinanced}
      disabled={!hasMarginLoanAccess}
    />
    <span>Finance with margin loan</span>
    {!hasMarginLoanAccess && (
      <InfoTooltip text="Requires Manifold membership" />
    )}
  </label>
</Row>

// In submitBet, add marginFinanced to API call:
const bet = await api('bet', {
  // ... existing params
  marginFinanced: marginFinanced || undefined,
})
```

### `backend/api/src/helpers/bets.ts` - `updateMakers()`

Key modification to handle margin loans when filling limit orders:

```typescript
// In updateMakers, before processing fills:
for (const [userId, spent] of Object.entries(spentByUser)) {
  const makerBalance = balanceByUserId[userId] ?? 0
  
  if (makerBalance < spent) {
    // Check if any of this maker's orders are margin-financed
    const makerOrders = makers.filter(m => m.bet.userId === userId)
    const hasMarginFinancedOrder = makerOrders.some(m => m.bet.marginFinanced)
    
    if (hasMarginFinancedOrder) {
      const missingAmount = spent - makerBalance
      // Try to take out margin loan
      const loanResult = await takeMarginLoanForFill(
        pgTrans, userId, missingAmount
      )
      if (loanResult.success) {
        // Update balance tracking
        balanceByUserId[userId] = makerBalance + loanResult.amount
      } else {
        // Handle insufficient loan capacity - skip fills for this maker
        // ... handle partial fills or skip
      }
    }
  }
}
```

## Edge Cases

1. **Partial loan capacity**: User might only have capacity for partial loan
   - Fill only the amount that can be covered
   
2. **Market eligibility**: Margin loans require eligible markets
   - Check market eligibility before filling
   
3. **Race conditions**: Multiple fills happening simultaneously
   - Use transaction and queue mechanisms already in place
   
4. **Expired subscription**: User's subscription might expire between order placement and fill
   - Re-check eligibility at fill time

## Testing Plan

1. **Unit tests**: Loan calculation edge cases
2. **Integration tests**:
   - Place margin-financed limit order with sufficient balance
   - Place margin-financed limit order, fill when balance is insufficient
   - Place margin-financed limit order, fill when at loan limit
   - Non-subscriber attempting to use the feature
3. **Manual testing**:
   - UI toggle behavior
   - Notification delivery
   - Balance and loan tracking

## Migration

No data migration needed - new orders will have the flag, old orders without it behave as before (no margin financing).
