# Common Knowledge

## User Authentication and Permissions

### Checking Admin Status

To check if a user is an admin, use the `isAdminId` function from `common/envs/constants` instead of checking for an `isAdmin` property on the user object.

Example:
```typescript
import { isAdminId } from 'common/envs/constants'

// Correct way to check if a user is an admin
if (user && isAdminId(user.id)) {
  // Admin-specific code here
}

// Incorrect way (do not use)
// if (user?.isAdmin) { ... }
```

This ensures consistent admin checks across the application and avoids errors related to non-existent properties.

## Unit testing

We use jest to unit test some things, particularly market math.

Run tests via `yarn run test`

Example:
```typescript
describe('addCpmmLiquidity', () => {
  it('should maintain probability after adding liquidity', () => {
    const pool = { YES: 150, NO: 50 }
    const p = 0.5
    const amount = 20

    const initialProb = getCpmmProbability(pool, p)
    const { newPool, newP } = addCpmmLiquidity(pool, p, amount)
    const newProb = getCpmmProbability(newPool, newP)

    expect(newProb).toBeCloseTo(initialProb, 5)
  })

  it('should not change if state if 0 liquidity is added', () => {
    const pool = { YES: 100, NO: 100 }
    const p = 0.5
    const amount = 0

    const { newPool, newP } = addCpmmLiquidity(pool, p, amount)

    expect(newPool.YES).toBeCloseTo(pool.YES, 5)
    expect(newPool.NO).toBeCloseTo(pool.NO, 5)
    expect(newP).toBeCloseTo(p, 5)
  })
});
```
