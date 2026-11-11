import { type Txn } from './txn'
import { PUBLIC_MANALINK_DESCRIPTION, toPublicTxn } from './public-txn'

// Txn's per-category data types are strict unions; fixtures only need the
// fields the redaction looks at.
const makeTxn = (overrides: Record<string, unknown>): Txn =>
  ({
    id: 't1',
    createdTime: 0,
    fromId: 'u1',
    fromType: 'USER',
    toId: 'u2',
    toType: 'USER',
    amount: 100,
    token: 'M$',
    category: 'TIP',
    ...overrides,
  } as Txn)

describe('toPublicTxn', () => {
  it('replaces manalink descriptions that carry the slug', () => {
    const txn = makeTxn({
      category: 'MANALINK',
      description: 'Manalink kC6JZrJg claimed: 1000 from alice to u2',
    })
    const result = toPublicTxn(txn)
    expect(result.description).toBe(PUBLIC_MANALINK_DESCRIPTION)
    expect(JSON.stringify(result)).not.toContain('kC6JZrJg')
    expect(result.amount).toBe(100)
    expect(result.toId).toBe('u2')
  })

  it('strips provider ids from mana purchases but keeps the amount paid', () => {
    const txn = makeTxn({
      fromId: 'EXTERNAL',
      fromType: 'BANK',
      category: 'MANA_PURCHASE',
      description: 'Deposit for mana purchase via crypto',
      data: {
        type: 'crypto',
        paidInCents: 2500,
        daimoSessionId: 'sess_1',
        daimoEventId: 'evt_1',
        daimoTxHash: '0xabc',
        bonusAmount: 10,
        offerId: 'offer_1',
      },
    })
    expect(toPublicTxn(txn).data).toEqual({ type: 'crypto', paidInCents: 2500 })
  })

  it('strips provider ids from cash outs and cash bonuses', () => {
    const cashOut = makeTxn({
      category: 'CASH_OUT',
      token: 'CASH',
      data: {
        type: 'gidx',
        sessionId: 's',
        transactionId: 'x',
        payoutInDollars: 5,
      },
    })
    expect(toPublicTxn(cashOut).data).toEqual({
      type: 'gidx',
      payoutInDollars: 5,
    })

    const cashBonus = makeTxn({
      category: 'CASH_BONUS',
      token: 'CASH',
      data: { type: 'apple', iapTransactionId: 'iap', paidInCents: 100 },
    })
    expect(toPublicTxn(cashBonus).data).toEqual({
      type: 'apple',
      paidInCents: 100,
    })
  })

  it('leaves other categories unchanged', () => {
    const txn = makeTxn({
      category: 'MANA_PAYMENT',
      description: 'Mana payment',
      data: { visibility: 'public', message: 'hi', groupId: 'g' },
    })
    expect(toPublicTxn(txn)).toBe(txn)
  })

  it('does not mutate its input', () => {
    const data = { type: 'stripe', stripeTransactionId: 'pi_1', paidInCents: 5 }
    const txn = makeTxn({ category: 'MANA_PURCHASE', data })
    toPublicTxn(txn)
    expect(txn.data).toBe(data)
    expect(data.stripeTransactionId).toBe('pi_1')
  })
})
