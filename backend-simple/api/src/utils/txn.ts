import { getDatabase } from '../helpers/db'

export type TxnType = 'USER' | 'BANK' | 'CONTRACT'

export type TxnCategory =
  | 'SIGNUP_BONUS'
  | 'MANA_PURCHASE'
  | 'MANA_PAYMENT'
  | 'CONTRACT_RESOLUTION_PAYOUT'
  | 'CONTRACT_RESOLUTION_FEE'
  | 'REFERRAL'
  | 'BETTING_STREAK_BONUS'

export type Txn = {
  id: string
  createdTime: number
  fromType: TxnType
  fromId: string
  toType: TxnType
  toId: string
  amount: number
  token: 'MANA'
  category: TxnCategory
  data?: Record<string, any>
}

// Generate transaction ID
function generateTxnId(): string {
  return `txn_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
}

// Process a transaction
export async function processTransaction(
  tx: any, // pg-promise transaction context
  params: {
    fromType: TxnType
    fromId: string
    toType: TxnType
    toId: string
    amount: number
    category: TxnCategory
    token?: 'MANA'
    data?: Record<string, any>
  }
): Promise<Txn> {
  const {
    fromType,
    fromId,
    toType,
    toId,
    amount,
    category,
    token = 'MANA',
    data = {},
  } = params

  // Validate amount
  if (amount <= 0) {
    throw new Error('Transaction amount must be positive')
  }

  // Deduct from source (if not BANK)
  if (fromType === 'USER') {
    await tx.none(
      'UPDATE users SET balance = balance - $1 WHERE id = $2 AND balance >= $1',
      [amount, fromId]
    )
  } else if (fromType === 'CONTRACT') {
    // For contract payouts, no balance check needed
    // Money comes from the contract's pool
  }

  // Add to destination (if not BANK)
  if (toType === 'USER') {
    await tx.none('UPDATE users SET balance = balance + $1 WHERE id = $2', [
      amount,
      toId,
    ])
  }

  // Create transaction record
  const txnId = generateTxnId()
  const txn: Txn = {
    id: txnId,
    createdTime: Date.now(),
    fromType,
    fromId,
    toType,
    toId,
    amount,
    token,
    category,
    data,
  }

  await tx.none(
    `INSERT INTO txns (id, from_type, from_id, to_type, to_id, amount, token, category, data, created_time)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
    [
      txn.id,
      txn.fromType,
      txn.fromId,
      txn.toType,
      txn.toId,
      txn.amount,
      txn.token,
      txn.category,
      JSON.stringify(txn.data),
    ]
  )

  return txn
}

// Helper: Give signup bonus
export async function giveSignupBonus(userId: string): Promise<Txn> {
  const STARTING_BALANCE = Number(process.env.STARTING_BALANCE) || 1000
  const db = getDatabase()

  return db.tx(async (tx) => {
    return processTransaction(tx, {
      fromType: 'BANK',
      fromId: 'BANK',
      toType: 'USER',
      toId: userId,
      amount: STARTING_BALANCE,
      category: 'SIGNUP_BONUS',
      data: { type: 'signup' },
    })
  })
}

// Helper: Process mana purchase
export async function processMana Purchase(
  userId: string,
  amount: number,
  data?: Record<string, any>
): Promise<Txn> {
  const db = getDatabase()

  return db.tx(async (tx) => {
    // Update total deposits
    await tx.none('UPDATE users SET total_deposits = total_deposits + $1 WHERE id = $2', [
      amount,
      userId,
    ])

    return processTransaction(tx, {
      fromType: 'BANK',
      fromId: 'BANK',
      toType: 'USER',
      toId: userId,
      amount,
      category: 'MANA_PURCHASE',
      data,
    })
  })
}

// Helper: Transfer mana between users
export async function transferMana(
  fromUserId: string,
  toUserId: string,
  amount: number,
  data?: Record<string, any>
): Promise<Txn> {
  const db = getDatabase()

  return db.tx(async (tx) => {
    return processTransaction(tx, {
      fromType: 'USER',
      fromId: fromUserId,
      toType: 'USER',
      toId: toUserId,
      amount,
      category: 'MANA_PAYMENT',
      data,
    })
  })
}

// Helper: Pay out resolved contract
export async function payoutResolvedContract(
  contractId: string,
  userId: string,
  amount: number,
  data?: Record<string, any>
): Promise<Txn> {
  const db = getDatabase()

  return db.tx(async (tx) => {
    return processTransaction(tx, {
      fromType: 'CONTRACT',
      fromId: contractId,
      toType: 'USER',
      toId: userId,
      amount,
      category: 'CONTRACT_RESOLUTION_PAYOUT',
      data,
    })
  })
}

// Helper: Collect resolution fee (profit tax)
export async function collectResolutionFee(
  userId: string,
  amount: number,
  contractId: string,
  data?: Record<string, any>
): Promise<Txn> {
  const db = getDatabase()

  return db.tx(async (tx) => {
    return processTransaction(tx, {
      fromType: 'USER',
      fromId: userId,
      toType: 'BANK',
      toId: 'BANK',
      amount,
      category: 'CONTRACT_RESOLUTION_FEE',
      data: { contractId, ...data },
    })
  })
}
