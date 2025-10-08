import { Bet } from './bet'
import { noFees } from './fees'
import { excludeSelfTrades } from './leagues'

describe('adjustBetsForSelfTrades', () => {
  const userId = 'user1'
  const otherUserId = 'user2'

  it('should not modify bets with no fills', () => {
    const bet: Bet = {
      id: 'bet1',
      userId,
      contractId: 'contract1',
      createdTime: Date.now(),
      amount: 100,
      shares: 95,
      outcome: 'YES',
      probBefore: 0.5,
      probAfter: 0.52,
      fees: noFees,
      isRedemption: false,
    }

    const adjusted = excludeSelfTrades([bet], userId)
    expect(adjusted).toHaveLength(1)
    expect(adjusted[0]).toEqual(bet)
  })

  it('should not modify bets filled only against the AMM', () => {
    const bet: Bet = {
      id: 'bet1',
      userId,
      contractId: 'contract1',
      createdTime: Date.now(),
      amount: 100,
      shares: 95,
      outcome: 'YES',
      probBefore: 0.5,
      probAfter: 0.52,
      fees: noFees,
      isRedemption: false,
      fills: [
        {
          matchedBetId: null, // AMM fill
          amount: 100,
          shares: 95,
          timestamp: Date.now(),
        },
      ],
    }

    const adjusted = excludeSelfTrades([bet], userId)
    expect(adjusted).toHaveLength(1)
    expect(adjusted[0]).toEqual(bet)
  })

  it('should not modify bets filled against other users', () => {
    const limitBet: Bet = {
      id: 'limitBet1',
      userId: otherUserId,
      contractId: 'contract1',
      createdTime: Date.now(),
      amount: 100,
      shares: 95,
      outcome: 'NO',
      probBefore: 0.5,
      probAfter: 0.5,
      fees: noFees,
      isRedemption: false,
    }

    const bet: Bet = {
      id: 'bet1',
      userId,
      contractId: 'contract1',
      createdTime: Date.now(),
      amount: 100,
      shares: 95,
      outcome: 'YES',
      probBefore: 0.5,
      probAfter: 0.52,
      fees: noFees,
      isRedemption: false,
      fills: [
        {
          matchedBetId: 'limitBet1',
          amount: 100,
          shares: 95,
          timestamp: Date.now(),
        },
      ],
    }

    const adjusted = excludeSelfTrades([bet, limitBet], userId)
    expect(adjusted).toHaveLength(2)
    expect(adjusted.find((b) => b.id === 'bet1')).toEqual(bet)
  })

  it('should exclude bet that fully fills against user own limit order', () => {
    const limitBet: Bet = {
      id: 'limitBet1',
      userId,
      contractId: 'contract1',
      createdTime: Date.now(),
      amount: 100,
      shares: 95,
      outcome: 'NO',
      probBefore: 0.5,
      probAfter: 0.5,
      fees: noFees,
      isRedemption: false,
    }

    const bet: Bet = {
      id: 'bet1',
      userId,
      contractId: 'contract1',
      createdTime: Date.now() + 1000,
      amount: 100,
      shares: 95,
      outcome: 'YES',
      probBefore: 0.5,
      probAfter: 0.52,
      fees: noFees,
      isRedemption: false,
      fills: [
        {
          matchedBetId: 'limitBet1',
          amount: 100,
          shares: 95,
          timestamp: Date.now() + 1000,
        },
      ],
    }

    const adjusted = excludeSelfTrades([bet, limitBet], userId)
    // The limit bet stays, but the filling bet should be excluded
    expect(adjusted).toHaveLength(1)
    expect(adjusted[0].id).toBe('limitBet1')
  })

  it('should partially adjust bet that partially fills against user own limit order', () => {
    const limitBet: Bet = {
      id: 'limitBet1',
      userId,
      contractId: 'contract1',
      createdTime: Date.now(),
      amount: 50,
      shares: 47.5,
      outcome: 'NO',
      probBefore: 0.5,
      probAfter: 0.5,
      fees: noFees,
      isRedemption: false,
    }

    const bet: Bet = {
      id: 'bet1',
      userId,
      contractId: 'contract1',
      createdTime: Date.now() + 1000,
      amount: 100,
      shares: 95,
      outcome: 'YES',
      probBefore: 0.5,
      probAfter: 0.52,
      fees: noFees,
      isRedemption: false,
      fills: [
        {
          matchedBetId: 'limitBet1', // Self-trade: 50 mana
          amount: 50,
          shares: 47.5,
          timestamp: Date.now() + 1000,
        },
        {
          matchedBetId: null, // AMM: 50 mana
          amount: 50,
          shares: 47.5,
          timestamp: Date.now() + 1000,
        },
      ],
    }

    const adjusted = excludeSelfTrades([bet, limitBet], userId)
    expect(adjusted).toHaveLength(2)

    // The limit bet should be unchanged
    expect(adjusted.find((b) => b.id === 'limitBet1')).toEqual(limitBet)

    // The filling bet should be adjusted to exclude the self-trade portion
    const adjustedBet = adjusted.find((b) => b.id === 'bet1')
    expect(adjustedBet).toBeDefined()
    expect(adjustedBet!.amount).toBe(50) // 100 - 50 (self-trade)
    expect(adjustedBet!.shares).toBe(47.5) // 95 - 47.5 (self-trade)
  })

  it('should handle multiple self-trades in one bet', () => {
    const limitBet1: Bet = {
      id: 'limitBet1',
      userId,
      contractId: 'contract1',
      createdTime: Date.now(),
      amount: 30,
      shares: 28.5,
      outcome: 'NO',
      probBefore: 0.5,
      probAfter: 0.5,
      fees: noFees,
      isRedemption: false,
    }

    const limitBet2: Bet = {
      id: 'limitBet2',
      userId,
      contractId: 'contract1',
      createdTime: Date.now(),
      amount: 20,
      shares: 19,
      outcome: 'NO',
      probBefore: 0.5,
      probAfter: 0.5,
      fees: noFees,
      isRedemption: false,
    }

    const bet: Bet = {
      id: 'bet1',
      userId,
      contractId: 'contract1',
      createdTime: Date.now() + 1000,
      amount: 100,
      shares: 95,
      outcome: 'YES',
      probBefore: 0.5,
      probAfter: 0.52,
      fees: noFees,
      isRedemption: false,
      fills: [
        {
          matchedBetId: 'limitBet1', // Self-trade: 30 mana
          amount: 30,
          shares: 28.5,
          timestamp: Date.now() + 1000,
        },
        {
          matchedBetId: 'limitBet2', // Self-trade: 20 mana
          amount: 20,
          shares: 19,
          timestamp: Date.now() + 1000,
        },
        {
          matchedBetId: null, // AMM: 50 mana
          amount: 50,
          shares: 47.5,
          timestamp: Date.now() + 1000,
        },
      ],
    }

    const adjusted = excludeSelfTrades([bet, limitBet1, limitBet2], userId)
    expect(adjusted).toHaveLength(3)

    const adjustedBet = adjusted.find((b) => b.id === 'bet1')
    expect(adjustedBet).toBeDefined()
    expect(adjustedBet!.amount).toBe(50) // 100 - 30 - 20 (self-trades)
    expect(adjustedBet!.shares).toBe(47.5) // 95 - 28.5 - 19 (self-trades)
  })

  it('should handle case where bet fills against own limit order from different contract', () => {
    // This shouldn't happen in practice, but let's make sure we handle different contracts
    const limitBet: Bet = {
      id: 'limitBet1',
      userId,
      contractId: 'contract1',
      createdTime: Date.now(),
      amount: 100,
      shares: 95,
      outcome: 'NO',
      probBefore: 0.5,
      probAfter: 0.5,
      fees: noFees,
      isRedemption: false,
    }

    const bet: Bet = {
      id: 'bet1',
      userId,
      contractId: 'contract2', // Different contract
      createdTime: Date.now() + 1000,
      amount: 100,
      shares: 95,
      outcome: 'YES',
      probBefore: 0.5,
      probAfter: 0.52,
      fees: noFees,
      isRedemption: false,
      fills: [
        {
          matchedBetId: 'limitBet1',
          amount: 100,
          shares: 95,
          timestamp: Date.now() + 1000,
        },
      ],
    }

    const adjusted = excludeSelfTrades([bet, limitBet], userId)
    // Should exclude the bet that filled against own limit order even if different contract
    expect(adjusted).toHaveLength(1)
    expect(adjusted[0].id).toBe('limitBet1')
  })

  it('should preserve other bet properties when adjusting', () => {
    const limitBet: Bet = {
      id: 'limitBet1',
      userId,
      contractId: 'contract1',
      createdTime: Date.now(),
      amount: 50,
      shares: 47.5,
      outcome: 'NO',
      probBefore: 0.5,
      probAfter: 0.5,
      fees: noFees,
      isRedemption: false,
    }

    const bet: Bet = {
      id: 'bet1',
      userId,
      contractId: 'contract1',
      answerId: 'answer1',
      createdTime: Date.now() + 1000,
      amount: 100,
      shares: 95,
      outcome: 'YES',
      probBefore: 0.5,
      probAfter: 0.52,
      fees: { ...noFees, platformFee: 1 },
      isRedemption: false,
      replyToCommentId: 'comment1',
      fills: [
        {
          matchedBetId: 'limitBet1',
          amount: 50,
          shares: 47.5,
          timestamp: Date.now() + 1000,
        },
        {
          matchedBetId: null,
          amount: 50,
          shares: 47.5,
          timestamp: Date.now() + 1000,
        },
      ],
    }

    const adjusted = excludeSelfTrades([bet, limitBet], userId)
    const adjustedBet = adjusted.find((b) => b.id === 'bet1')

    expect(adjustedBet).toBeDefined()
    expect(adjustedBet!.id).toBe('bet1')
    expect(adjustedBet!.userId).toBe(userId)
    expect(adjustedBet!.contractId).toBe('contract1')
    expect(adjustedBet!.answerId).toBe('answer1')
    expect(adjustedBet!.createdTime).toBe(bet.createdTime)
    expect(adjustedBet!.outcome).toBe('YES')
    expect(adjustedBet!.probBefore).toBe(0.5)
    expect(adjustedBet!.probAfter).toBe(0.52)
    expect(adjustedBet!.replyToCommentId).toBe('comment1')
    // Amount and shares should be adjusted
    expect(adjustedBet!.amount).toBe(50)
    expect(adjustedBet!.shares).toBe(47.5)
  })
})
