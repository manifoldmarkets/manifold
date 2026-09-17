import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { APIError } from 'common/api/utils'
import {
  actingPlayers,
  canRock,
  handView,
  PokerInvariantError,
  potSize,
  resolveRound,
  raiseSize,
  runOutBoard,
  settleHand,
  wholeMana,
} from 'common/poker/engine'
import {
  PokerAction,
  PokerHand,
  PokerSeat,
  PokerTableSummary,
  PokerTableView,
  POKER_COUNTDOWN_MS,
  POKER_MAX_SEATS,
  POKER_MINIMUM_MULTIPLIER,
  POKER_RESULTS_MS,
  POKER_ROUND_MS,
} from 'common/poker/types'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { insertTxn } from 'shared/txn/run-txn'
import { broadcastUserUpdates } from 'shared/supabase/users'
import { broadcast } from 'shared/websockets/server'
import { log } from 'shared/utils'

type TableRow = {
  id: string
  creator_id: string
  name: string
  visibility: 'public' | 'private'
  ante: number
  access_hash: string | null
  started: boolean
  closing: boolean
  closed: boolean
  paused: boolean
  version: number
  hand_number: number
  dealer: number
  next_tick: number | null
}
type SeatRow = {
  table_id: string
  user_id: string
  seat: number
  session_id: string
  ready: boolean
  needs_minimum: boolean
  leaving: boolean
  auto_paper: boolean
  session_profit: number
}
type Wallet = {
  changed?: boolean
  id: string
  balance: number
  total_deposits: number
  cash_balance: number
  spice_balance: number
  total_cash_deposits: number
  data: {
    name?: string
    username?: string
    avatarUrl?: string
    userDeleted?: boolean
  }
}
type HandRow = {
  id: string
  state: PokerHand
  escrow: number
  settled: boolean
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
export function hasPokerAccess(
  table: Pick<TableRow, 'visibility' | 'access_hash'>,
  token?: string
) {
  if (table.visibility === 'public') return true
  if (!token || !table.access_hash) return false
  const expected = Buffer.from(table.access_hash, 'hex')
  const actual = Buffer.from(hash(token), 'hex')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
export const pokerEnabled = async (pg: SupabaseDirectClient) =>
  (
    await pg.one<{ new_hands_enabled: boolean }>(
      'select new_hands_enabled from poker_settings where id = true'
    )
  ).new_hands_enabled

function summary(
  table: TableRow,
  seats: number,
  hand?: Pick<HandRow, 'settled'> | null,
  newHandsEnabled = true
): PokerTableSummary {
  return {
    id: table.id,
    name: table.name,
    creatorId: table.creator_id,
    visibility: table.visibility,
    ante: table.ante,
    minimumBalance: table.ante * POKER_MINIMUM_MULTIPLIER,
    seats,
    started: table.started,
    status: table.paused
      ? 'paused'
      : table.closed
      ? 'closed'
      : hand && !hand.settled
      ? 'playing'
      : table.next_tick && newHandsEnabled
      ? hand?.settled
        ? 'results'
        : 'countdown'
      : 'waiting',
  }
}
async function checkAccess(
  pg: SupabaseDirectClient,
  table: TableRow | null,
  token?: string,
  uid?: string,
  allowSeatedDeparture = false
) {
  const releasingOwnSeat =
    table && allowSeatedDeparture && uid
      ? await pg.oneOrNone(
          'select 1 from poker_seats where table_id=$1 and user_id=$2',
          [table.id, uid]
        )
      : false
  if (!table || (!hasPokerAccess(table, token) && !releasingOwnSeat))
    throw new APIError(404, 'Table not found or private link required')
  if (uid) {
    const mod = await pg.oneOrNone<{ banned: boolean }>(
      'select banned from poker_moderation where table_id = $1 and user_id = $2',
      [table.id, uid]
    )
    // Banned players can finish an already dealt hand; removal takes effect on settlement.
    if (mod?.banned) {
      const playing = await pg.oneOrNone(
        "select 1 from poker_seats s join poker_hands h on h.table_id = s.table_id and not h.settled where s.table_id = $1 and s.user_id = $2 and h.state->'players' @> $3::jsonb",
        [table.id, uid, JSON.stringify([{ userId: uid }])]
      )
      if (!playing)
        throw new APIError(403, 'You have been removed from this table')
    }
  }
  return table
}
async function loadHand(pg: SupabaseDirectClient, tableId: string) {
  return pg.oneOrNone<HandRow>(
    'select id, state, escrow, settled from poker_hands where table_id = $1 order by number desc limit 1',
    [tableId]
  )
}
async function saveHand(pg: SupabaseTransaction, hand: PokerHand) {
  await pg.none(
    'update poker_hands set state = $2::jsonb, settled = $3 where id = $1',
    [hand.id, JSON.stringify(hand), !!hand.settlement]
  )
}
async function lockWallets(pg: SupabaseTransaction, ids: string[]) {
  const rows = await pg.manyOrNone<Wallet>(
    "select id, balance, total_deposits, cash_balance, spice_balance, total_cash_deposits, data || jsonb_build_object('name', name, 'username', username) as data from users where id = any($1::text[]) order by id for update",
    [[...new Set(ids)]]
  )
  return new Map(rows.map((u) => [u.id, u]))
}

// Only called with the table and affected user rows locked. Ledger and wallet
// mutations share the same transaction; public txns contain no table/hand IDs.
async function transfer(
  pg: SupabaseTransaction,
  handId: string,
  user: Wallet,
  amount: number,
  kind: 'contribution' | 'refund' | 'payout',
  operation: string
) {
  if (!amount) return
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new PokerInvariantError('Invalid transfer')
  const debit = kind === 'contribution'
  if (debit && wholeMana(user.balance) < amount)
    throw new PokerInvariantError('Insufficient locked balance')
  const delta = debit ? -amount : amount
  const updated = await pg.oneOrNone<{
    balance: number
    total_deposits: number
  }>(
    'update users set balance = balance + $2, total_deposits = total_deposits + $2 where id = $1 and balance + $2 >= 0 returning balance, total_deposits',
    [user.id, delta]
  )
  if (!updated) throw new PokerInvariantError('Wallet update failed')
  Object.assign(user, updated, { changed: true })
  const txn = await insertTxn(pg, {
    category:
      kind === 'contribution'
        ? 'POKER_CONTRIBUTION'
        : kind === 'refund'
        ? 'POKER_REFUND'
        : 'POKER_PAYOUT',
    token: 'M$',
    amount,
    fromType: debit ? 'USER' : 'BANK',
    fromId: debit ? user.id : 'BANK',
    toType: debit ? 'BANK' : 'USER',
    toId: debit ? 'BANK' : user.id,
    description:
      kind === 'contribution'
        ? 'Poker contribution'
        : kind === 'refund'
        ? 'Poker refund'
        : 'Poker winnings',
  })
  await pg.none(
    'insert into poker_ledger (hand_id, operation, user_id, amount, kind, txn_id) values ($1,$2,$3,$4,$5,$6)',
    [handId, operation, user.id, amount, kind, txn.id]
  )
  const escrow = await pg.oneOrNone(
    'update poker_hands set escrow = escrow + $2 where id = $1 and escrow + $2 >= 0 returning escrow',
    [handId, -delta]
  )
  if (!escrow) throw new PokerInvariantError('Escrow underflow')
}
async function settle(
  pg: SupabaseTransaction,
  table: TableRow,
  hand: PokerHand,
  wallets: Map<string, Wallet>,
  now: number
) {
  const result = hand.settlement!
  const { escrow } = await pg.one<{ escrow: number }>(
    'select escrow from poker_hands where id = $1',
    [hand.id]
  )
  if (escrow !== potSize(hand))
    throw new PokerInvariantError('Escrow does not match contributions')
  for (const p of hand.players) {
    const user = wallets.get(p.userId)!
    const refund = result.refunds[p.userId] ?? 0
    const payout = result.payouts[p.userId] ?? 0
    await transfer(pg, hand.id, user, refund, 'refund', `refund/${p.userId}`)
    await transfer(pg, hand.id, user, payout, 'payout', `payout/${p.userId}`)
    await pg.none(
      'update poker_seats set session_profit = session_profit + $2 where session_id = $1',
      [p.sessionId, refund + payout - p.contributed]
    )
  }
  const remaining = await pg.one<{ escrow: number }>(
    'select escrow from poker_hands where id = $1',
    [hand.id]
  )
  if (remaining.escrow !== 0)
    throw new PokerInvariantError('Settlement left escrow')
  await saveHand(pg, hand)
  await pg.none('delete from poker_seats where table_id = $1 and leaving', [
    table.id,
  ])
  table.next_tick = now + POKER_RESULTS_MS
  if (table.closing) {
    table.closed = true
    table.next_tick = null
    await pg.none('delete from poker_seats where table_id = $1', [table.id])
  }
}
function shuffledDeck() {
  const deck = Array.from({ length: 52 }, (_, i) => i)
  for (let i = 51; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}
async function deal(
  pg: SupabaseTransaction,
  table: TableRow,
  seats: SeatRow[],
  wallets: Map<string, Wallet>,
  now: number
) {
  // Read bans at each deal, including for continuously ready players. An active
  // hand can finish, but a newly banned account must not pay another ante.
  const banned = new Set(
    (
      await pg.manyOrNone<{ user_id: string }>(
        `select distinct user_id from user_bans
       where user_id = any($1::text[]) and ban_type = 'trading'
         and ended_at is null and (end_time is null or end_time > now())`,
        [seats.map((s) => s.user_id)]
      )
    ).map((b) => b.user_id)
  )
  const minimumBalance = table.ante * POKER_MINIMUM_MULTIPLIER
  const eligible: SeatRow[] = []
  for (const s of seats.filter((s) => s.ready && !s.leaving)) {
    const user = wallets.get(s.user_id)
    if (
      !user ||
      user.data.userDeleted ||
      banned.has(s.user_id) ||
      wholeMana(user.balance) < (s.needs_minimum ? minimumBalance : 1)
    ) {
      s.ready = false
      s.needs_minimum = true
      await pg.none(
        'update poker_seats set ready = false, needs_minimum = true where user_id = $1',
        [s.user_id]
      )
    } else eligible.push(s)
  }
  if (eligible.length < 2) {
    table.next_tick = null
    return
  }
  const deck = shuffledDeck()
  table.dealer =
    eligible.find((s) => s.seat > table.dealer)?.seat ?? eligible[0].seat
  table.hand_number++
  const hand: PokerHand = {
    id: randomUUID(),
    number: table.hand_number,
    dealer: table.dealer,
    street: 0,
    deadline: now + POKER_ROUND_MS,
    deck,
    board: [],
    moves: {},
    rounds: [],
    players: eligible.map((s) => {
      const user = wallets.get(s.user_id)!
      const ante = Math.min(table.ante, wholeMana(user.balance))
      return {
        userId: user.id,
        name: user.data.name ?? 'Player',
        avatarUrl: user.data.avatarUrl,
        seat: s.seat,
        sessionId: s.session_id,
        cards: deck.splice(0, 2),
        contributed: ante,
        folded: false,
        allIn: ante === wholeMana(user.balance),
      }
    }),
  }
  await pg.none(
    'insert into poker_hands (id, table_id, number, state) values ($1,$2,$3,$4::jsonb)',
    [hand.id, table.id, hand.number, JSON.stringify(hand)]
  )
  for (const p of hand.players) {
    await transfer(
      pg,
      hand.id,
      wallets.get(p.userId)!,
      p.contributed,
      'contribution',
      `ante/${p.userId}`
    )
    await pg.none(
      'update poker_seats set needs_minimum = false where user_id = $1',
      [p.userId]
    )
  }
  if (actingPlayers(hand).length < 2) {
    runOutBoard(hand)
    hand.settlement = settleHand(hand)
    await settle(pg, table, hand, wallets, now)
  } else table.next_tick = hand.deadline
}
async function advance(
  pg: SupabaseTransaction,
  table: TableRow,
  seats: SeatRow[],
  row: HandRow | null,
  wallets: Map<string, Wallet>,
  now: number
) {
  if (table.closed || table.paused) return false
  if (row && !row.settled) {
    let hand = row.state
    const automatic = seats.filter((s) => s.auto_paper).map((s) => s.user_id)
    for (const p of actingPlayers(hand))
      if (automatic.includes(p.userId) && !hand.moves[p.userId])
        hand.moves[p.userId] = 'paper'
    if (
      now < hand.deadline &&
      actingPlayers(hand).some((p) => !hand.moves[p.userId])
    ) {
      await saveHand(pg, hand)
      return false
    }
    hand = resolveRound(
      hand,
      Object.fromEntries([...wallets].map(([id, u]) => [id, u.balance])),
      now,
      automatic
    )
    for (const m of hand.rounds[hand.rounds.length - 1].moves) {
      await transfer(
        pg,
        hand.id,
        wallets.get(m.userId)!,
        m.paid,
        'contribution',
        `round/${row.state.street}/${m.userId}`
      )
      if (m.timedOut)
        await pg.none(
          'update poker_seats set ready = false, needs_minimum = true where user_id = $1',
          [m.userId]
        )
    }
    if (hand.settlement) await settle(pg, table, hand, wallets, now)
    else {
      await saveHand(pg, hand)
      table.next_tick = hand.deadline
    }
    table.version++
    return true
  }
  if (table.closing) {
    table.closed = true
    table.next_tick = null
    await pg.none('delete from poker_seats where table_id = $1', [table.id])
    return true
  }
  if (!(await pokerEnabled(pg))) {
    // Keep a future tick so an enabled switch resumes waiting tables.
    table.next_tick = now + POKER_COUNTDOWN_MS
    return false
  }
  if (table.visibility === 'private' && !table.started) {
    const changed = table.next_tick !== null
    table.next_tick = null
    return changed
  }
  if (seats.filter((s) => s.ready && !s.leaving).length < 2) {
    const changed = table.next_tick !== null
    table.next_tick = null
    return changed
  }
  if (table.next_tick === null) {
    table.next_tick = now + POKER_COUNTDOWN_MS
    return true
  }
  if (table.next_tick <= now) {
    await deal(pg, table, seats, wallets, now)
    table.version++
    return true
  }
  return false
}
async function saveTable(pg: SupabaseTransaction, table: TableRow) {
  await pg.none(
    'update poker_tables set started=$2, closing=$3, closed=$4, paused=$5, version=$6, hand_number=$7, dealer=$8, next_tick=$9 where id=$1',
    [
      table.id,
      table.started,
      table.closing,
      table.closed,
      table.paused,
      table.version,
      table.hand_number,
      table.dealer,
      table.next_tick,
    ]
  )
}
function notify(wallets: Map<string, Wallet>) {
  const changed = [...wallets.values()].filter((u) => u.changed)
  if (changed.length)
    broadcastUserUpdates(
      changed.map((u) => ({
        id: u.id,
        balance: u.balance,
        total_deposits: u.total_deposits,
        cash_balance: u.cash_balance,
        spice_balance: u.spice_balance,
        total_cash_deposits: u.total_cash_deposits,
      }))
    )
  // A single content-free topic does not reveal private table IDs or moves.
  broadcast('poker', {})
}
async function handleFailure(tableId: string, error: unknown): Promise<never> {
  if (error instanceof PokerInvariantError) {
    await createSupabaseDirectClient().none(
      'update poker_tables set paused=true where id=$1',
      [tableId]
    )
    log.error('Poker hand paused: accounting or state invariant failed', {
      tableId,
    })
    throw new APIError(
      503,
      'This table is paused while its hand is checked. Your committed mana remains in escrow.'
    )
  }
  throw error
}

export async function createPokerTable(
  uid: string,
  props: {
    requestId: string
    ante: number
    visibility: 'public' | 'private'
    accessToken?: string
  }
) {
  const pg = createSupabaseDirectClient()
  await pg.tx({ tag: 'poker' }, async (tx) => {
    const wallets = await lockWallets(tx, [uid])
    const user = wallets.get(uid)
    if (!user || user.data.userDeleted)
      throw new APIError(403, 'Account unavailable')
    const existing = await tx.oneOrNone<TableRow>(
      'select * from poker_tables where id=$1',
      [props.requestId]
    )
    const accessHash = props.accessToken ? hash(props.accessToken) : null
    if (existing) {
      if (
        existing.creator_id !== uid ||
        existing.ante !== props.ante ||
        existing.visibility !== props.visibility ||
        existing.access_hash !== accessHash
      )
        throw new APIError(409, 'Creation request already used')
      return
    }
    if (!(await pokerEnabled(tx)))
      throw new APIError(503, 'New poker games are temporarily paused')
    const { count } = await tx.one<{ count: number }>(
      'select count(*)::int as count from poker_tables where creator_id=$1 and not closed',
      [uid]
    )
    if (count >= 10)
      throw new APIError(429, 'Close an existing table before creating another')
    await tx.none(
      'insert into poker_tables (id, creator_id, name, visibility, ante, access_hash, started) values ($1,$2,$3,$4,$5,$6,$7)',
      [
        props.requestId,
        uid,
        `${user.data.name ?? 'Player'}’s table`,
        props.visibility,
        props.ante,
        accessHash,
        props.visibility === 'public',
      ]
    )
  })
  broadcast('poker', {})
  return { tableId: props.requestId }
}
export async function listPokerTables(uid?: string) {
  const pg = createSupabaseDirectClient()
  const tables = await pg.manyOrNone<
    TableRow & { seats: number; active: boolean; settled: boolean }
  >(`select t.*, (select count(*)::int from poker_seats s where s.table_id=t.id) as seats,
    exists(select 1 from poker_hands h where h.table_id=t.id and not h.settled) as active,
    exists(select 1 from poker_hands h where h.table_id=t.id and h.settled) as settled
    from poker_tables t where visibility='public' and not closed order by seats desc, created_time desc limit 100`)
  const seat = uid
    ? await pg.oneOrNone<{ table_id: string }>(
        'select table_id from poker_seats where user_id=$1',
        [uid]
      )
    : null
  const newHandsEnabled = await pokerEnabled(pg)
  return {
    tables: tables.map((t) =>
      summary(
        t,
        t.seats,
        t.active ? { settled: false } : t.settled ? { settled: true } : null,
        newHandsEnabled
      )
    ),
    yourTableId: seat?.table_id,
    newHandsEnabled,
  }
}
export async function getPokerTable(
  tableId: string,
  token?: string,
  uid?: string
): Promise<PokerTableView> {
  const pg = createSupabaseDirectClient()
  // One consistent snapshot prevents mixing cards/moves across a concurrent deal.
  return pg.tx({ tag: 'poker' }, async (tx) => {
    await tx.none('set transaction isolation level repeatable read read only')
    const table = await checkAccess(
      tx,
      await tx.oneOrNone<TableRow>('select * from poker_tables where id=$1', [
        tableId,
      ]),
      token,
      uid
    )
    const rows = await tx.manyOrNone<SeatRow & { data: Wallet['data'] }>(
      "select s.*, u.data || jsonb_build_object('name', u.name, 'username', u.username) as data from poker_seats s join users u on u.id=s.user_id where table_id=$1 order by seat",
      [tableId]
    )
    const hands = await tx.manyOrNone<HandRow>(
      'select id, state, escrow, settled from poker_hands where table_id=$1 order by number desc limit 11',
      [tableId]
    )
    const row = hands[0]
    const user = uid
      ? await tx.oneOrNone<{ balance: number }>(
          'select balance from users where id=$1',
          [uid]
        )
      : null
    const mod = uid
      ? await tx.oneOrNone<{ muted: boolean; banned: boolean }>(
          'select muted, banned from poker_moderation where table_id=$1 and user_id=$2',
          [tableId, uid]
        )
      : null
    const moderation =
      uid === table.creator_id
        ? await tx.manyOrNone<{
            userId: string
            name: string
            muted: boolean
            banned: boolean
          }>(
            'select m.user_id as "userId", u.name, m.muted, m.banned from poker_moderation m join users u on u.id=m.user_id where m.table_id=$1 and (m.muted or m.banned)',
            [tableId]
          )
        : []
    const messages = await tx.manyOrNone<{
      id: number
      user_id: string
      text: string
      created_time: string
      data: Wallet['data']
    }>(
      "select m.*, u.data || jsonb_build_object('name', u.name, 'username', u.username) as data from poker_messages m join users u on u.id=m.user_id where table_id=$1 order by m.id desc limit 100",
      [tableId]
    )
    const seats: PokerSeat[] = rows.map((s) => ({
      userId: s.user_id,
      name: s.data.name ?? 'Player',
      avatarUrl: s.data.avatarUrl,
      seat: s.seat,
      ready: s.ready,
      leaving: s.leaving,
      needsMinimum: s.needs_minimum,
      sessionProfit: s.session_profit,
    }))
    const active = row && !row.settled ? row.state : null
    const actor = active?.players.find(
      (p) => p.userId === uid && !p.folded && !p.allIn
    )
    const requirement = active ? raiseSize(active) : 0
    const newHandsEnabled = await pokerEnabled(tx)
    return {
      table: summary(table, rows.length, row, newHandsEnabled),
      version: table.version,
      serverTime: Date.now(),
      nextDealAt: active || !newHandsEnabled ? null : table.next_tick,
      closing: table.closing,
      newHandsEnabled,
      seats,
      hand: row ? handView(row.state, uid) : null,
      history: hands.slice(1).map((h) => handView(h.state, uid)),
      moderation,
      messages: messages.reverse().map((m) => ({
        id: m.id,
        userId: m.user_id,
        username: m.data.username ?? '',
        name: m.data.name ?? 'Player',
        avatarUrl: m.data.avatarUrl,
        text: m.text,
        createdTime: new Date(m.created_time).getTime(),
      })),
      viewer: {
        balance: user?.balance ?? null,
        canEnter:
          !!user &&
          wholeMana(user.balance) >= table.ante * POKER_MINIMUM_MULTIPLIER &&
          !mod?.banned,
        canRock:
          !!actor &&
          !!active &&
          !!user &&
          !active.moves[uid!] &&
          canRock(active, user.balance),
        rockRequirement: requirement,
        maximumCall: active ? requirement * actingPlayers(active).length : 0,
        muted: mod?.muted ?? false,
        banned: mod?.banned ?? false,
      },
    }
  })
}

export async function actPoker(
  uid: string,
  props: {
    tableId: string
    accessToken?: string
    requestId: string
    version: number
    action: PokerAction
  }
) {
  let changedWallets = new Map<string, Wallet>()
  let changed = false
  try {
    changed = !!(await createSupabaseDirectClient().tx(
      { tag: 'poker' },
      async (tx) => {
        const tableRow = await tx.oneOrNone<TableRow>(
          'select * from poker_tables where id=$1 for update',
          [props.tableId]
        )
        const fingerprint = hash(
          JSON.stringify({ tableId: props.tableId, action: props.action })
        )
        const prior = await tx.oneOrNone<{ fingerprint: string }>(
          'select fingerprint from poker_requests where user_id=$1 and request_id=$2',
          [uid, props.requestId]
        )
        if (prior && prior.fingerprint !== fingerprint)
          throw new APIError(409, 'Request ID already used')
        // A retried departure must succeed after its seat was deleted, even if the
        // browser has lost the invite. The receipt is bound to this user/action.
        if (prior && props.action.type === 'leave') return
        const table = await checkAccess(
          tx,
          tableRow,
          props.accessToken,
          uid,
          props.action.type === 'leave'
        )
        if (prior) return
        const a = props.action
        if (table.closed && a.type !== 'leave')
          throw new APIError(409, 'Table is closed')
        if (
          table.paused &&
          !['chat', 'leave', 'close', 'mute', 'ban'].includes(a.type)
        )
          throw new APIError(409, 'Table is paused for review')
        // Concurrent moves/chat do not invalidate each other. The hand/street pair
        // is the move version; structural operations use the table version.
        if (
          props.version > table.version ||
          (!['move', 'chat', 'leave'].includes(a.type) &&
            props.version !== table.version)
        )
          throw new APIError(409, 'Table changed. Refresh and try again.')
        const receipt = () =>
          tx.none(
            'insert into poker_requests(user_id,request_id,table_id,fingerprint) values($1,$2,$3,$4)',
            [uid, props.requestId, table.id, fingerprint]
          )
        // Chat and chat moderation share table serialization for access/rate-limit
        // checks, but never invalidate gameplay versions or lock player wallets.
        if (a.type === 'chat' || a.type === 'mute') {
          const user = await tx.oneOrNone<{ data: Wallet['data'] }>(
            'select data from users where id=$1',
            [uid]
          )
          if (!user || user.data.userDeleted)
            throw new APIError(403, 'Account unavailable')
          if (a.type === 'mute') {
            if (table.creator_id !== uid)
              throw new APIError(403, 'Only the table creator can do that')
            if (a.userId === uid)
              throw new APIError(400, 'You cannot moderate yourself')
            await tx.none(
              'insert into poker_moderation(table_id,user_id,muted) values($1,$2,$3) on conflict(table_id,user_id) do update set muted=excluded.muted',
              [table.id, a.userId, a.enabled]
            )
          } else if (a.type === 'chat') {
            const mod = await tx.oneOrNone<{ muted: boolean; banned: boolean }>(
              'select muted,banned from poker_moderation where table_id=$1 and user_id=$2',
              [table.id, uid]
            )
            if (mod?.muted || mod?.banned)
              throw new APIError(403, 'Chat is muted for your account')
            const recent = await tx.oneOrNone(
              "select 1 from poker_messages where user_id=$1 and table_id=$2 and created_time > now() - interval '1 second' limit 1",
              [uid, table.id]
            )
            if (recent)
              throw new APIError(
                429,
                'Please wait a moment before sending another message'
              )
            await tx.none(
              'insert into poker_messages(table_id,user_id,text) values($1,$2,$3)',
              [table.id, uid, a.text]
            )
          }
          await receipt()
          return true
        }
        const minimumBalance = table.ante * POKER_MINIMUM_MULTIPLIER
        let seats = await tx.manyOrNone<SeatRow>(
          'select * from poker_seats where table_id=$1 order by seat',
          [table.id]
        )
        const row = await loadHand(tx, table.id)
        const hand = row && !row.settled ? row.state : null
        const wallets = await lockWallets(tx, [
          ...seats.map((s) => s.user_id),
          ...(hand?.players.map((p) => p.userId) ?? []),
          uid,
        ])
        changedWallets = wallets
        const user = wallets.get(uid)
        if (!user || user.data.userDeleted)
          throw new APIError(403, 'Account unavailable')
        const seat = seats.find((s) => s.user_id === uid)
        const mod = await tx.oneOrNone<{ muted: boolean; banned: boolean }>(
          'select muted,banned from poker_moderation where table_id=$1 and user_id=$2',
          [table.id, uid]
        )
        const now = Date.now()
        if (a.type === 'join') {
          if (mod?.banned || table.closing)
            throw new APIError(403, 'Table is not accepting you as a player')
          if (!seat) {
            const occupied = await tx.oneOrNone(
              'select table_id from poker_seats where user_id=$1',
              [uid]
            )
            if (occupied)
              throw new APIError(409, 'Leave your other table first')
            if (seats.length >= POKER_MAX_SEATS)
              throw new APIError(409, 'Table is full')
            if (wholeMana(user.balance) < minimumBalance)
              throw new APIError(403, `You need M${minimumBalance} to join`)
            const number = Array.from(
              { length: POKER_MAX_SEATS },
              (_, i) => i
            ).find((i) => !seats.some((s) => s.seat === i))!
            await tx.none(
              'insert into poker_seats(table_id,user_id,seat,session_id) values($1,$2,$3,$4)',
              [table.id, uid, number, randomUUID()]
            )
          }
        } else if (a.type === 'ready') {
          if (!seat || seat.leaving || mod?.banned || table.closing)
            throw new APIError(403, 'Join an available seat first')
          if (
            a.ready &&
            !seat.ready &&
            wholeMana(user.balance) < minimumBalance
          )
            throw new APIError(
              403,
              `You need M${minimumBalance} to start or resume`
            )
          await tx.none(
            'update poker_seats set ready=$2, needs_minimum=case when not $2 then true else needs_minimum end where user_id=$1',
            [uid, a.ready]
          )
        } else if (a.type === 'leave') {
          // The creator owns moderation and the private game's first start.
          // Close on explicit departure rather than leave an unattended table.
          // advance()/settle() defer closure until the current hand is paid out.
          if (table.creator_id === uid) table.closing = true
          if (hand?.players.some((p) => p.userId === uid))
            await tx.none(
              'update poker_seats set leaving=true,auto_paper=true,ready=false,needs_minimum=true where user_id=$1',
              [uid]
            )
          else
            await tx.none(
              'delete from poker_seats where user_id=$1 and table_id=$2',
              [uid, table.id]
            )
        } else if (a.type === 'move') {
          if (
            !hand ||
            !seat ||
            seat.auto_paper ||
            hand.id !== a.handId ||
            hand.street !== a.street ||
            now >= hand.deadline
          )
            throw new APIError(
              409,
              'This betting round has ended or you are leaving'
            )
          if (!actingPlayers(hand).some((p) => p.userId === uid))
            throw new APIError(403, 'You are not choosing a move this round')
          if (hand.moves[uid])
            throw new APIError(409, 'Your move is already locked')
          if (a.move === 'rock' && !canRock(hand, user.balance))
            throw new APIError(403, `Rock requires M${raiseSize(hand)}`)
          await tx.none(
            'insert into poker_moves(hand_id,street,user_id,move) values($1,$2,$3,$4)',
            [hand.id, hand.street, uid, a.move]
          )
          // `hand` is row.state; advance() below persists the locked move or
          // resolves the round in this same transaction.
          hand.moves[uid] = a.move
        } else {
          if (table.creator_id !== uid)
            throw new APIError(403, 'Only the table creator can do that')
          if (a.type === 'start') {
            if (table.started) throw new APIError(409, 'Game already started')
            if (
              seats.filter(
                (s) =>
                  s.ready &&
                  !s.leaving &&
                  wholeMana(wallets.get(s.user_id)!.balance) >=
                    (s.needs_minimum ? minimumBalance : 1)
              ).length < 2
            )
              throw new APIError(
                400,
                'At least two eligible players must be ready'
              )
            if (!(await pokerEnabled(tx)))
              throw new APIError(503, 'New hands are temporarily paused')
            table.started = true
          } else if (a.type === 'close') table.closing = true
          else if (a.type === 'ban') {
            if (a.userId === uid)
              throw new APIError(400, 'You cannot moderate yourself')
            await tx.none(
              'insert into poker_moderation(table_id,user_id,banned) values($1,$2,$3) on conflict(table_id,user_id) do update set banned=excluded.banned',
              [table.id, a.userId, a.enabled]
            )
            if (a.enabled) {
              if (hand?.players.some((p) => p.userId === a.userId))
                await tx.none(
                  'update poker_seats set leaving=true,ready=false where table_id=$1 and user_id=$2',
                  [table.id, a.userId]
                )
              else
                await tx.none(
                  'delete from poker_seats where table_id=$1 and user_id=$2',
                  [table.id, a.userId]
                )
            }
          }
        }
        table.version++
        seats = await tx.manyOrNone<SeatRow>(
          'select * from poker_seats where table_id=$1 order by seat',
          [table.id]
        )
        // Bans only queue seat removal. Voluntary departures auto-Paper future
        // unsubmitted choices; already locked moves remain binding in both cases.
        await advance(tx, table, seats, row, wallets, now)
        await saveTable(tx, table)
        await receipt()
        return true
      }
    ))
  } catch (e) {
    return handleFailure(props.tableId, e)
  }
  if (changed) notify(changedWallets)
  return { success: true }
}

export async function tickPoker() {
  const pg = createSupabaseDirectClient()
  const due = await pg.manyOrNone<{ id: string; next_tick: number }>(
    'select id,next_tick from poker_tables where next_tick <= $1 and not closed and not paused order by next_tick limit 100',
    [Date.now()]
  )
  for (const item of due) {
    let wallets = new Map<string, Wallet>()
    try {
      const changed = await pg.tx({ tag: 'poker' }, async (tx) => {
        const table = await tx.oneOrNone<TableRow>(
          'select * from poker_tables where id=$1 for update skip locked',
          [item.id]
        )
        const now = Date.now()
        if (
          !table ||
          table.closed ||
          table.paused ||
          table.next_tick === null ||
          table.next_tick > now
        )
          return
        if (now - table.next_tick > 10_000)
          log.warn('Poker table deadline overdue', {
            tableId: table.id,
            overdueMs: now - table.next_tick,
          })
        const seats = await tx.manyOrNone<SeatRow>(
          'select * from poker_seats where table_id=$1 order by seat',
          [table.id]
        )
        const row = await loadHand(tx, table.id)
        wallets = await lockWallets(tx, [
          ...seats.map((s) => s.user_id),
          ...(row?.state.players.map((p) => p.userId) ?? []),
        ])
        const changed = await advance(tx, table, seats, row, wallets, now)
        await saveTable(tx, table)
        return changed
      })
      if (changed) notify(wallets)
    } catch (e) {
      try {
        await handleFailure(item.id, e)
      } catch {
        // Never log the error object: database errors may embed hidden state.
        log.error(
          'Poker deadline processing failed; pending hands will retry',
          { tableId: item.id }
        )
      }
    }
  }
}
