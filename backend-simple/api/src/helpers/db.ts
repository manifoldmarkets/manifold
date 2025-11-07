import pgPromise from 'pg-promise'

const pgp = pgPromise({
  // Initialization options
})

let db: pgPromise.IDatabase<any> | null = null

export function initializeDatabase() {
  if (db) return db

  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set')
  }

  db = pgp(connectionString)
  console.log('✅ Database connection initialized')

  return db
}

export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.')
  }
  return db
}

// Helper to run queries in a transaction
export async function runInTransaction<T>(
  callback: (tx: pgPromise.ITask<any>) => Promise<T>
): Promise<T> {
  const database = getDatabase()
  return database.tx(callback)
}

// Common query helpers
export const queries = {
  // Users
  getUserById: (id: string) =>
    getDatabase().oneOrNone('SELECT * FROM users WHERE id = $1', [id]),

  getUserByUsername: (username: string) =>
    getDatabase().oneOrNone('SELECT * FROM users WHERE username = $1', [
      username,
    ]),

  createUser: (user: any) =>
    getDatabase().one(
      `INSERT INTO users (id, name, username, avatar_url, balance, total_deposits, data, created_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [
        user.id,
        user.name,
        user.username,
        user.avatarUrl,
        user.balance,
        user.totalDeposits || 0,
        JSON.stringify(user),
      ]
    ),

  updateUser: (id: string, data: any) =>
    getDatabase().one(
      `UPDATE users
       SET data = data || $2::jsonb,
           name = COALESCE($3, name),
           username = COALESCE($4, username),
           avatar_url = COALESCE($5, avatar_url)
       WHERE id = $1
       RETURNING *`,
      [id, JSON.stringify(data), data.name, data.username, data.avatarUrl]
    ),

  // Contracts
  getContractById: (id: string) =>
    getDatabase().oneOrNone('SELECT * FROM contracts WHERE id = $1', [id]),

  getContractBySlug: (slug: string) =>
    getDatabase().oneOrNone('SELECT * FROM contracts WHERE slug = $1', [slug]),

  createContract: (contract: any) =>
    getDatabase().one(
      `INSERT INTO contracts (
        id, slug, creator_id, question, description, mechanism, outcome_type,
        close_time, resolution, data, created_time
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       RETURNING *`,
      [
        contract.id,
        contract.slug,
        contract.creatorId,
        contract.question,
        contract.description || '',
        contract.mechanism,
        contract.outcomeType,
        contract.closeTime,
        contract.resolution || null,
        JSON.stringify(contract),
      ]
    ),

  // Bets
  createBet: (bet: any) =>
    getDatabase().one(
      `INSERT INTO contract_bets (
        bet_id, user_id, contract_id, amount, outcome, shares,
        prob_before, prob_after, is_redemption, answer_id, data, created_time
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       RETURNING *`,
      [
        bet.id,
        bet.userId,
        bet.contractId,
        bet.amount,
        bet.outcome,
        bet.shares,
        bet.probBefore,
        bet.probAfter,
        bet.isRedemption || false,
        bet.answerId || null,
        JSON.stringify(bet),
      ]
    ),

  getBetsByContract: (contractId: string, limit = 100) =>
    getDatabase().any(
      'SELECT * FROM contract_bets WHERE contract_id = $1 ORDER BY created_time DESC LIMIT $2',
      [contractId, limit]
    ),

  getBetsByUser: (userId: string, limit = 100) =>
    getDatabase().any(
      'SELECT * FROM contract_bets WHERE user_id = $1 ORDER BY created_time DESC LIMIT $2',
      [userId, limit]
    ),

  // Transactions
  createTxn: (txn: any) =>
    getDatabase().one(
      `INSERT INTO txns (
        id, from_type, from_id, to_type, to_id, amount, token, category, data, created_time
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING *`,
      [
        txn.id,
        txn.fromType,
        txn.fromId,
        txn.toType,
        txn.toId,
        txn.amount,
        txn.token || 'MANA',
        txn.category,
        JSON.stringify(txn),
      ]
    ),

  getTxnsByUser: (userId: string, limit = 100) =>
    getDatabase().any(
      `SELECT * FROM txns
       WHERE from_id = $1 OR to_id = $1
       ORDER BY created_time DESC
       LIMIT $2`,
      [userId, limit]
    ),

  // Comments
  createComment: (comment: any) =>
    getDatabase().one(
      `INSERT INTO contract_comments (
        comment_id, contract_id, user_id, content, data, created_time
       )
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [
        comment.id,
        comment.contractId,
        comment.userId,
        comment.content,
        JSON.stringify(comment),
      ]
    ),

  getCommentsByContract: (contractId: string, limit = 100) =>
    getDatabase().any(
      'SELECT * FROM contract_comments WHERE contract_id = $1 ORDER BY created_time DESC LIMIT $2',
      [contractId, limit]
    ),
}
