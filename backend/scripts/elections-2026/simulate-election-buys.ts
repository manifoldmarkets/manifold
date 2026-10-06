// Read-only price-impact simulation for election sources, using the same bet
// math the API uses (common/new-bet: CPMM + sum-to-one arbitrage + limit-order
// matching with maker balance checks). Nothing is submitted anywhere.
//
//   cd backend/scripts
//   npx ts-node elections-2026/simulate-election-buys.ts \
//     --snapshot <audit dir> --targets <targets.json> --out <result.json> \
//     [--synthetic <manifest.json>]
//
// --snapshot reads out/markets.json, raw/deep_limits.jsonl and raw/makers.jsonl
// from a read-only DB snapshot. --synthetic also simulates each manifest
// entry's freshly created pool (seed probabilities, chosen tier), which has no
// limit orders yet.
//
// Limitations (also written into the output): pools, orders and maker
// balances are frozen at the snapshot; each buy is simulated alone against
// that state; balances shown are total balances, not net of other open orders;
// loans, user limits, bet delays and API-only rules are ignored.

import * as fs from 'fs'
import * as path from 'path'
import { LimitBet } from 'common/bet'
import { getBinaryCpmmBetInfo, getNewMultiCpmmBetInfo } from 'common/new-bet'
import { getNewContract } from 'common/new-contract'
import { getAnte } from 'common/economy'
import { User } from 'common/user'
import { isMultiCpmmMechanism } from 'common/contract'

const args = Object.fromEntries(
  process.argv.slice(2).reduce<[string, string][]>((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]])
    return acc
  }, [])
)
const AMOUNTS = [10, 100]
const snap = args.snapshot
const L = (f: string) =>
  fs
    .readFileSync(path.join(snap, f), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))

type Target = { contractId: string; answerIds?: string[]; why?: string }

function limitBetsFor(contractId: string, rows: any[]): LimitBet[] {
  return rows
    .filter((b) => b.contract_id === contractId)
    .map((b) => ({
      id: b.bet_id,
      userId: b.user_id,
      contractId,
      answerId: b.answer_id ?? undefined,
      createdTime: Date.parse(b.created_utc),
      amount: Number(b.filled_amount),
      orderAmount: Number(b.order_amount),
      shares: Number(b.shares),
      outcome: b.outcome,
      limitProb: Number(b.limit_prob),
      isFilled: false,
      isCancelled: false,
      fills: [],
      probBefore: 0,
      probAfter: 0,
      fees: { creatorFee: 0, platformFee: 0, liquidityFee: 0 },
      isRedemption: false,
      loanAmount: 0,
      expiresAt: b.expires_utc ? Date.parse(b.expires_utc) : undefined,
      visibility: 'public',
    })) as LimitBet[]
}

function summarise(bet: any) {
  const fills = bet.fills ?? []
  const fromOrders = fills.filter((f: any) => f.matchedBetId)
  return {
    probBefore: round(bet.probBefore),
    probAfter: round(bet.probAfter),
    shares: round(bet.shares, 2),
    avgPrice: bet.shares ? round(bet.amount / bet.shares) : null,
    filledFromLimitOrders: round(
      fromOrders.reduce((s: number, f: any) => s + f.amount, 0),
      2
    ),
    filledFromPool: round(
      fills
        .filter((f: any) => !f.matchedBetId)
        .reduce((s: number, f: any) => s + f.amount, 0),
      2
    ),
  }
}
const round = (x: number, d = 4) =>
  Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : x

export function simulateMarket(
  m: any,
  orders: LimitBet[],
  balances: Record<string, number>,
  onlyAnswers?: string[]
) {
  const out: any[] = []
  if (m.outcomeType === 'BINARY') {
    const contract: any = {
      id: m.id,
      outcomeType: 'BINARY',
      mechanism: 'cpmm-1',
      pool: m.pool,
      p: m.p,
      collectedFees: { creatorFee: 0, platformFee: 0, liquidityFee: 0 },
      visibility: 'public',
    }
    for (const outcome of ['YES', 'NO'] as const)
      for (const amount of AMOUNTS) {
        const { newBet } = getBinaryCpmmBetInfo(
          contract,
          outcome,
          amount,
          undefined,
          orders,
          balances
        )
        out.push({ answer: 'binary', outcome, amount, ...summarise(newBet) })
      }
    return out
  }
  if (!isMultiCpmmMechanism(m.mechanism))
    throw new Error(`Unsupported simulation mechanism: ${m.mechanism}`)
  const answers = m.answers
    .filter((a: any) => !a.resolution)
    .map((a: any) => ({
      id: a.id,
      index: a.index,
      contractId: m.id,
      text: a.text,
      poolYes: a.poolYes,
      poolNo: a.poolNo,
      prob: a.prob,
      p: a.p ?? 0.5,
      totalLiquidity: a.totalLiquidity,
      subsidyPool: a.subsidyPool,
      isOther: a.isOther,
      createdTime: 0,
      userId: '',
      probChanges: { day: 0, week: 0, month: 0 },
      volume: 0,
    }))
  const contract: any = {
    id: m.id,
    outcomeType: 'MULTIPLE_CHOICE',
    mechanism: m.mechanism,
    shouldAnswersSumToOne: m.shouldAnswersSumToOne,
    answers,
    collectedFees: { creatorFee: 0, platformFee: 0, liquidityFee: 0 },
    visibility: 'public',
  }
  for (const a of answers) {
    if (onlyAnswers?.length && !onlyAnswers.includes(a.id)) continue
    for (const outcome of ['YES', 'NO'] as const)
      for (const amount of AMOUNTS) {
        try {
          const res: any = getNewMultiCpmmBetInfo(
            contract,
            answers,
            a,
            outcome,
            amount,
            undefined,
            orders,
            balances
          )
          out.push({
            answer: a.text,
            answerId: a.id,
            outcome,
            amount,
            ...summarise(res.newBet),
          })
        } catch (e) {
          out.push({
            answer: a.text,
            answerId: a.id,
            outcome,
            amount,
            error: (e as Error).message,
          })
        }
      }
  }
  return out
}

export function syntheticMarket(entry: any) {
  const p = entry.payload
  if (p.outcomeType === 'BINARY') {
    // Ballot-measure binaries: the same pool the API builds for this tier and
    // starting probability.
    const binaryAnte =
      getAnte('BINARY', undefined, p.liquidityTier) + (p.extraLiquidity ?? 0)
    const b: any = getNewContract({
      id: 'synthetic',
      slug: 'synthetic',
      question: p.question,
      description: { type: 'doc', content: [] } as any,
      closeTime: p.closeTime,
      visibility: 'public',
      isTwitchContract: false,
      token: 'MANA',
      creator: { id: 'u', name: 'u', username: 'u', avatarUrl: '' } as User,
      outcomeType: 'BINARY',
      initialProb: p.initialProb ?? 50,
      ante: binaryAnte,
      min: 0,
      max: 0,
      isLogScale: false,
      answers: [],
      unit: undefined,
      midpoints: undefined,
      timezone: undefined,
    } as any)
    return { id: entry.raceKey, outcomeType: 'BINARY', pool: b.pool, p: b.p }
  }
  const ante =
    getAnte(p.outcomeType, p.answers.length, p.liquidityTier) +
    (p.extraLiquidity ?? 0)
  const c: any = getNewContract({
    id: 'synthetic',
    slug: 'synthetic',
    question: p.question,
    description: { type: 'doc', content: [] } as any,
    closeTime: p.closeTime,
    visibility: 'public',
    isTwitchContract: false,
    token: 'MANA',
    creator: { id: 'u', name: 'u', username: 'u', avatarUrl: '' } as User,
    outcomeType: 'MULTIPLE_CHOICE',
    initialProb: 50,
    ante,
    min: 0,
    max: 0,
    isLogScale: false,
    answers: p.answers,
    addAnswersMode: p.addAnswersMode,
    shouldAnswersSumToOne: true,
    answerProbs: p.answerProbs,
    unit: undefined,
    midpoints: undefined,
    timezone: undefined,
  } as any)
  return {
    ...c,
    id: entry.raceKey,
  }
}

function main() {
  const markets = JSON.parse(
    fs.readFileSync(path.join(snap, 'out/markets.json'), 'utf8')
  )
  const limits = L('raw/deep_limits.jsonl')
  const balances: Record<string, number> = Object.fromEntries(
    L('raw/makers.jsonl').map((u: any) => [u.id, Number(u.balance)])
  )
  const meta = JSON.parse(
    fs.readFileSync(path.join(snap, 'raw/deep_limits.jsonl.meta.json'), 'utf8')
  )
  const targets: Target[] = args.targets
    ? JSON.parse(fs.readFileSync(args.targets, 'utf8'))
    : []
  const results: any = {
    snapshotUtc: meta.snapshotUtc,
    method:
      'common/new-bet getBinaryCpmmBetInfo / getNewMultiCpmmBetInfo, market orders (no limit price), each buy simulated alone',
    limitations: [
      'Pools, open orders and maker balances frozen at the snapshot time; anything traded since is not reflected.',
      'Each buy is independent (not cumulative).',
      'Maker balances are total balances, not net of their other open orders, so order depth may be overstated.',
      'Loans, per-user limits, bet delays, API taker rules and websocket races are ignored.',
      'Synthetic (planned) markets have no limit orders; impact there is pool-only.',
    ],
    markets: [] as any[],
    synthetic: [] as any[],
  }
  for (const t of targets) {
    const m = markets[t.contractId]
    if (!m) {
      results.markets.push({
        contractId: t.contractId,
        error: 'not in snapshot',
      })
      continue
    }
    results.markets.push({
      contractId: m.id,
      slug: m.slug,
      question: m.question,
      why: t.why,
      totalLiquidity: m.totalLiquidity,
      liveLimitOrders: m.limitDepth,
      buys: simulateMarket(
        m,
        limitBetsFor(m.id, limits),
        balances,
        t.answerIds
      ),
    })
  }
  if (args.synthetic) {
    const manifest = JSON.parse(fs.readFileSync(args.synthetic, 'utf8'))
    for (const entry of manifest.entries.filter(
      (e: any) => e.status === 'ready'
    )) {
      const m = syntheticMarket(entry)
      results.synthetic.push({
        raceKey: entry.raceKey,
        tier: entry.payload.liquidityTier,
        buys: simulateMarket(m, [], {}),
      })
    }
  }
  fs.writeFileSync(args.out, JSON.stringify(results, null, 2))
  console.log(
    `wrote ${args.out}: ${results.markets.length} markets, ${results.synthetic.length} synthetic`
  )
}

if (require.main === module) main()
