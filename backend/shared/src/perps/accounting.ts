// Accounting-mode transitions and the read-only protected-basis simulator.
//
// Every mutating entry point here runs under the same advisory lock and
// SERIALIZABLE transaction as the engine, writes the immutable epoch record
// BEFORE flipping the contract (the contracts trigger refuses a flip without
// one), presents the transition and epoch GUCs to the database guard, and
// commits the top-up, backfill, activation event, per-user reduction
// receipts, any activation ADL, its payouts, the metrics rebuild and the
// version flip atomically. Nothing here is reachable from a user-facing
// endpoint: it is driven by backend/scripts/perp-protected-basis-preflight.ts.

import { APIError } from 'common/api/utils'
import { PerpContract } from 'common/contract'
import {
  isAllowedPerpAccountingTransition,
  PerpAccounting,
  PerpAccountingMode,
  readPerpAccounting,
} from 'common/perps/accounting-mode'
import {
  parsePerpShadowCheckpoint,
  seedPerpShadowCheckpoint,
} from 'common/perps/accounting-shadow'
import { getReserveBasis, PerpState } from 'common/perps/amm'
import { getOracleFreshness } from 'common/perps/oracle'
import { PerpDirection, PerpEvent, PerpPosition } from 'common/perps/position'
import {
  assertPerpProtectedState,
  getPerpAccountingSnapshot,
  PerpAccountingSnapshot,
  withReserveBasis,
} from 'common/perps/protected-basis'
import {
  classifyPerpMigration,
  perpActivationConfirmation,
  perpActivationFingerprint,
  PerpActivationPlan,
  perpActivationPlanDigest,
  PerpActivationPlanOptions,
  perpActivationReductions,
  PerpMigrationReport,
  planPerpProtectedActivation,
  summarizePerpInvariants,
  verifyPerpAccountingDowngrade,
} from 'common/perps/protected-migration'
import {
  comparePerpAdmissionPolicies,
  evaluatePerpClaimAllowanceShadow,
  PERP_CLAIM_ALLOWANCE_ALPHA_CANDIDATES,
  PerpAdmissionComparison,
  PerpClaimAllowanceShadow,
} from 'common/perps/risk-policy-shadow'
import { removeUndefinedProps } from 'common/util/object'
import { SupabaseDirectClient, SupabaseTransaction } from 'shared/supabase/init'
import { runTxnOutsideBetQueue } from 'shared/txn/run-txn'
import { log } from 'shared/utils'
import { assertPerpEscrowBalance } from './escrow'
import {
  asEvent,
  buildAdlEvents,
  diffForWrite,
  loadPerpStateForUpdate,
  openInterestPatch,
  payAdlSettlements,
  runPerpTransaction,
} from './engine'
import {
  deleteShadowCheckpointQuery,
  insertAccountingEpochQuery,
  insertPerpEventsQuery,
  mergeContractDataQuery,
  PerpAccountingEpochRecord,
  presentAccountingEpochQuery,
  presentAccountingTransitionQuery,
  PositionRow,
  rowToPosition,
  selectShadowCheckpointQuery,
  upsertPositionsQuery,
  upsertShadowCheckpointQuery,
} from './queries'
import { buildPerpUserContractMetricsQuery } from './user-contract-metrics'

// -----------------------------------------------------------------------
// read-only simulation (Stage 0)
// -----------------------------------------------------------------------

export type PerpProtectedSimulation = {
  contractId: string
  slug: string
  accounting: PerpAccounting
  solvencyHalted: boolean
  oraclePrice: number
  oraclePriceTime: number | undefined
  oracleFresh: boolean
  positionCount: number
  migration: PerpMigrationReport
  /** R/E/D/H at b = c (legacy/shadow) or at the live b (protected). */
  snapshot: PerpAccountingSnapshot
  invariants: ReturnType<typeof summarizePerpInvariants>
  /** Would `b = c` plus the exact required top-up satisfy every invariant? */
  activationAtFullBasis: PerpActivationPlan
  /** Same, but allowing the activation ADL the plan would need. */
  activationWithAdl: PerpActivationPlan
  admission: { long: PerpAdmissionComparison; short: PerpAdmissionComparison }
  claimAllowance: PerpClaimAllowanceShadow[]
  history: {
    eventCount: number
    firstEventTime: number | null
    /** Rows written before the protected-basis column existed (Δb = 0 default). */
    eventsWithoutBasisHistory: number
    /** Historical replay from events is optional and NOT attempted here. */
    replayAttempted: false
  }
  /**
   * The forward checkpoint kept while the contract is in accounting shadow:
   * the cumulative protected-basis state it would have, and how often it
   * diverged from the legacy ledger. Null unless shadow has run.
   */
  shadow: {
    epoch: number
    transitions: number
    divergences: number
    reseeds: number
    basisDeficit: number
    reducedBasisCount: number
    lastReport: unknown
    updatedTime: number
  } | null
}

const loadPositionsReadOnly = async (
  pg: Pick<SupabaseDirectClient, 'manyOrNone'>,
  contractId: string,
  accounting: PerpAccounting
) => {
  const rows = await pg.manyOrNone<PositionRow>(
    `select * from contract_perp_positions where contract_id = $1`,
    [contractId]
  )
  return rows.map((r) => rowToPosition(r, accounting))
}

const loadContractReadOnly = async (
  pg: Pick<SupabaseDirectClient, 'oneOrNone'>,
  contractId: string
) => {
  const row = await pg.oneOrNone<{ data: PerpContract }>(
    `select data from contracts where id = $1 and mechanism = 'perp'`,
    [contractId]
  )
  if (!row) throw new APIError(404, `Perp contract ${contractId} not found`)
  return row.data
}

export const simulatePerpProtectedAccounting = async (
  pg: SupabaseDirectClient,
  contractId: string
): Promise<PerpProtectedSimulation> => {
  const contract = await loadContractReadOnly(pg, contractId)
  const accounting = readPerpAccounting(contract)
  const positions = await loadPositionsReadOnly(pg, contractId, accounting)
  const state: PerpState = {
    pool: { L: contract.poolLong, S: contract.poolShort },
    positions,
  }
  const price = contract.oraclePrice
  const normalized: PerpState = {
    pool: state.pool,
    positions: positions.map(withReserveBasis),
  }
  const migration = classifyPerpMigration(state, price)
  const topUp = {
    long: migration.long.requiredTopUp,
    short: migration.short.requiredTopUp,
  }
  const history = await pg.one<{
    event_count: number | string
    first_event: string | null
    without_history: number | string
  }>(
    `select count(*) as event_count,
            min(applied_ts) as first_event,
            count(*) filter (where accounting_epoch = 0 and reserve_basis_delta = 0 and cost_basis_delta <> 0) as without_history
       from contract_perp_events where contract_id = $1`,
    [contractId]
  )
  const shadowRow = await pg.oneOrNone<{
    accounting_epoch: number | string
    state: unknown
    transitions: number | string
    divergences: number | string
    last_report: unknown
    updated_time: string
  }>(selectShadowCheckpointQuery(contractId))
  const shadowCheckpoint = shadowRow
    ? parsePerpShadowCheckpoint(
        shadowRow.state,
        Number(shadowRow.accounting_epoch)
      )
    : null
  const shadowSnapshot = shadowCheckpoint
    ? getPerpAccountingSnapshot(
        { pool: shadowCheckpoint.pool, positions: shadowCheckpoint.positions },
        price
      )
    : null
  return {
    contractId,
    slug: contract.slug,
    accounting,
    solvencyHalted: contract.solvencyHaltTime != null,
    oraclePrice: price,
    oraclePriceTime: contract.oraclePriceTime,
    oracleFresh:
      getOracleFreshness(
        contract.oraclePriceTime,
        contract.maxOraclePriceAgeMs,
        Date.now()
      ).status === 'fresh',
    positionCount: positions.filter((p) => p.size > 0).length,
    migration,
    snapshot: getPerpAccountingSnapshot(normalized, price),
    invariants: summarizePerpInvariants(normalized, price),
    activationAtFullBasis: planPerpProtectedActivation(state, price, {
      topUp,
      allocation: 'full-basis',
      allowActivationAdl: false,
    }),
    activationWithAdl: planPerpProtectedActivation(state, price, {
      topUp,
      allocation: 'full-basis',
      allowActivationAdl: true,
    }),
    admission: {
      long: comparePerpAdmissionPolicies('long', normalized, price),
      short: comparePerpAdmissionPolicies('short', normalized, price),
    },
    claimAllowance: PERP_CLAIM_ALLOWANCE_ALPHA_CANDIDATES.map((alpha) =>
      evaluatePerpClaimAllowanceShadow(normalized, price, alpha)
    ),
    history: {
      eventCount: Number(history.event_count),
      firstEventTime:
        history.first_event === null
          ? null
          : new Date(history.first_event).getTime(),
      eventsWithoutBasisHistory: Number(history.without_history),
      replayAttempted: false,
    },
    shadow:
      shadowRow && shadowCheckpoint && shadowSnapshot
        ? {
            epoch: Number(shadowRow.accounting_epoch),
            transitions: Number(shadowRow.transitions),
            divergences: Number(shadowRow.divergences),
            reseeds: shadowCheckpoint.reseeds,
            basisDeficit:
              shadowSnapshot.long.basisDeficit +
              shadowSnapshot.short.basisDeficit,
            reducedBasisCount:
              shadowSnapshot.long.reducedBasisCount +
              shadowSnapshot.short.reducedBasisCount,
            lastReport: shadowRow.last_report,
            updatedTime: new Date(shadowRow.updated_time).getTime(),
          }
        : null,
  }
}

// -----------------------------------------------------------------------
// transitions
// -----------------------------------------------------------------------

const epochRecordSnapshot = (
  before: PerpPosition[],
  after: PerpPosition[]
): PerpAccountingEpochRecord['positionSnapshot'] => {
  const afterByKey = new Map(
    after.map((p) => [`${p.userId}:${p.direction}`, p])
  )
  return before
    .filter((p) => p.size > 0)
    .map((p) => {
      const next = afterByKey.get(`${p.userId}:${p.direction}`)
      return {
        userId: p.userId,
        direction: p.direction,
        size: p.size,
        costBasis: p.costBasis,
        reserveBasisBefore: getReserveBasis(p),
        reserveBasisAfter: next ? getReserveBasis(next) : 0,
      }
    })
}

const activationEvent = (
  contract: PerpContract,
  from: PerpAccountingMode,
  to: PerpAccountingMode,
  epoch: number,
  now: number,
  price: number,
  data: Record<string, unknown>
): PerpEvent =>
  asEvent(contract, {
    userId: null,
    eventType: 'accounting-activation',
    direction: null,
    leverage: null,
    sizeDelta: 0,
    costBasisDelta: 0,
    reserveBasisDelta: 0,
    originalCostBasisDelta: 0,
    data: { from, to, epoch, ...data },
    appliedTime: now,
    ts: now,
    oraclePrice: price,
  })

const assertTransition = (
  accounting: PerpAccounting,
  to: PerpAccountingMode,
  state: PerpState,
  contract: PerpContract
) => {
  if (contract.solvencyHaltTime != null)
    throw new APIError(
      409,
      `Cannot change accounting on ${contract.slug} while a solvency halt is in effect; clear it first`
    )
  if (
    !isAllowedPerpAccountingTransition(accounting.mode, to, {
      hasOpenPositions: state.positions.some((p) => p.size > 0),
    })
  )
    throw new APIError(
      409,
      `Accounting transition ${accounting.mode} -> ${to} is not allowed on ${contract.slug}`
    )
}

/**
 * legacy -> shadow. No position changes: shadow commits legacy ledgers. From
 * here on every transition advances an isolated forward checkpoint of the
 * protected-basis state (common/perps/accounting-shadow), seeded now from
 * the live state with b = c, and records how it diverges from the ledger.
 */
export const activatePerpAccountingShadow = async (
  contractId: string,
  actorId: string
) =>
  runPerpTransaction(async (pgTrans) => {
    const { contract, state, accounting } = await loadPerpStateForUpdate(
      pgTrans,
      contractId
    )
    assertTransition(accounting, 'shadow', state, contract)
    const now = Date.now()
    const epoch = accounting.epoch + 1
    await pgTrans.none(
      insertAccountingEpochQuery({
        contractId,
        epoch,
        accountingMode: 'shadow',
        previousMode: accounting.mode,
        oraclePrice: contract.oraclePrice,
        oraclePriceTime: contract.oraclePriceTime ?? null,
        poolLong: state.pool.L,
        poolShort: state.pool.S,
        topUpLong: 0,
        topUpShort: 0,
        reducedAnyBasis: false,
        positionSnapshot: epochRecordSnapshot(state.positions, state.positions),
        data: { actorId },
      })
    )
    await pgTrans.one(presentAccountingTransitionQuery())
    await pgTrans.one(
      mergeContractDataQuery(contractId, {
        perpAccountingMode: 'shadow',
        perpAccountingEpoch: epoch,
        lastUpdatedTime: now,
      })
    )
    const seed = seedPerpShadowCheckpoint(state, epoch)
    await pgTrans.none(
      upsertShadowCheckpointQuery({
        contractId,
        accountingEpoch: epoch,
        state: seed,
        transitions: 0,
        divergences: 0,
        lastReport: null,
      })
    )
    // The event is stamped by the guard with the mode/epoch now on the
    // contract; it is a pool-level record, not a user action.
    await pgTrans.none(
      insertPerpEventsQuery(
        [
          activationEvent(
            contract,
            accounting.mode,
            'shadow',
            epoch,
            now,
            contract.oraclePrice,
            { actorId }
          ),
        ],
        { ...accounting, mode: 'shadow', epoch }
      )
    )
    log(
      `[perps][accounting] ${contract.slug}: ${accounting.mode} -> shadow (epoch ${epoch}) by ${actorId}`
    )
    return { contract, epoch }
  })

export type PerpProtectedActivationOptions = PerpActivationPlanOptions & {
  /** Pays any top-up from their balance (ADD_SUBSIDY). Required when nonzero. */
  funderId?: string
  /** Activate on a stale cached mark. Off by default: the cutover mark must be executable. */
  allowStaleMark?: boolean
  /**
   * Required whenever the activation can reduce anyone (the last-resort
   * allocation, an activation ADL, any b < c) and whenever `allowStaleMark`
   * is set: the PLAN digest the dry run printed (book fingerprint, every
   * plan input and every outcome). The live run recomputes the plan under
   * the lock and refuses to commit unless the digest is identical, so an
   * approval never authorizes a different haircut — a different top-up on
   * the same book, or a legacy trade at an identical mark, aborts.
   */
  confirmedPlan?: string
}

export type PerpProtectedActivationDryRun = {
  contractId: string
  slug: string
  mark: number
  markTime: number | undefined
  markFresh: boolean
  /** Digest of the book alone (mark, pools, rows); informational. */
  fingerprint: string
  /** Pass back as `confirmedPlan`; see PerpProtectedActivationOptions. */
  planDigest: string
  accounting: PerpAccounting
  plan: PerpActivationPlan
  /** Every row the plan would leave with b < c, with the exact numbers. */
  reductions: {
    userId: string
    direction: PerpDirection
    costBasis: number
    reserveBasisAfter: number
    reduction: number
  }[]
}

/**
 * The activation, computed and reported without writing anything. The
 * per-user reductions it prints are exactly what activation would commit on
 * this book; a reducing activation (and one on a stale mark, or with the
 * last-resort allocation) must then pass the printed `planDigest` back as
 * `confirmedPlan`.
 */
export const dryRunPerpAccountingProtected = async (
  pg: SupabaseDirectClient,
  contractId: string,
  options: PerpActivationPlanOptions
): Promise<PerpProtectedActivationDryRun> => {
  const contract = await loadContractReadOnly(pg, contractId)
  const accounting = readPerpAccounting(contract)
  const positions = await loadPositionsReadOnly(pg, contractId, accounting)
  const state: PerpState = {
    pool: { L: contract.poolLong, S: contract.poolShort },
    positions,
  }
  const plan = planPerpProtectedActivation(state, contract.oraclePrice, options)
  return {
    contractId,
    slug: contract.slug,
    mark: contract.oraclePrice,
    markTime: contract.oraclePriceTime,
    markFresh:
      getOracleFreshness(
        contract.oraclePriceTime,
        contract.maxOraclePriceAgeMs,
        Date.now()
      ).status === 'fresh',
    fingerprint: perpActivationFingerprint(state, contract.oraclePrice),
    planDigest: perpActivationPlanDigest(
      state,
      contract.oraclePrice,
      options,
      plan
    ),
    accounting,
    plan,
    reductions: perpActivationReductions(plan).map((a) => ({
      userId: a.userId,
      direction: a.direction,
      costBasis: a.costBasis,
      reserveBasisAfter: a.reserveBasisAfter,
      reduction: a.reserveBasisBefore - a.reserveBasisAfter,
    })),
  }
}

/**
 * shadow -> protected (or legacy -> protected on an EMPTY contract).
 *
 * At one fixed cutover mark — the contract's committed oracle price, read
 * under the lock — apply the approved top-up, assign every b, run the
 * activation ADL only if approved, and commit the immutable record, the
 * version flip, every position row (stamped with the new epoch, with an
 * explicit b), the activation event, one basis-settlement receipt per row
 * whose b was set below c, any ADL events/payouts and the metrics rebuild
 * in one transaction. Any blocker aborts the whole thing.
 */
export const activatePerpAccountingProtected = async (
  contractId: string,
  actorId: string,
  options: PerpProtectedActivationOptions
) =>
  runPerpTransaction(async (pgTrans) => {
    const { contract, state, accounting } = await loadPerpStateForUpdate(
      pgTrans,
      contractId
    )
    assertTransition(accounting, 'protected', state, contract)
    const now = Date.now()
    if (!options.allowStaleMark) {
      const freshness = getOracleFreshness(
        contract.oraclePriceTime,
        contract.maxOraclePriceAgeMs,
        now
      )
      if (freshness.status !== 'fresh')
        throw new APIError(
          409,
          `Cannot activate on a stale cutover mark for ${contract.slug} (${freshness.status}); wait for a fresh tick or pass allowStaleMark`
        )
    }
    const price = contract.oraclePrice
    await assertPerpEscrowBalance(pgTrans, contractId, state.pool)

    const plan = planPerpProtectedActivation(state, price, options)
    if (!plan.ok)
      throw new APIError(
        409,
        `Cannot activate protected accounting on ${
          contract.slug
        }: ${plan.blockers.join('; ')}`
      )

    // A reducing activation (last-resort allocation, activation ADL, any
    // row left with b < c) is not user-conservative, and a stale-mark
    // activation trusts a reviewer rather than the clock. Either may only
    // execute the exact PLAN a reviewer saw in the dry run: the plan is
    // recomputed under the lock from the locked book and the caller's
    // options, and its digest — inputs and outcomes alike — must match. A
    // tick, a legacy trade, a settlement, a subsidy, or a different top-up
    // or policy in between aborts rather than silently reallocating.
    const fingerprint = perpActivationFingerprint(state, price)
    const planDigest = perpActivationPlanDigest(state, price, options, plan)
    const confirmation = perpActivationConfirmation(options, plan, planDigest)
    if (confirmation.required !== null) {
      if (options.confirmedPlan === undefined)
        throw new APIError(
          400,
          `${
            confirmation.required === 'reducing'
              ? 'A reducing activation'
              : 'Activating on a stale mark'
          } requires confirmedPlan: the plan digest reported by the dry run`
        )
      if (!confirmation.matches)
        throw new APIError(
          409,
          `Plan changed since the dry run: reviewed ${options.confirmedPlan}, the locked book now plans ${planDigest} (mark ${price}, book ${fingerprint}); re-run the dry run`
        )
    }

    // Top-up: real mana from the funder, so the escrow invariant stays checkable.
    const topUps = (['long', 'short'] as const).filter(
      (side) => options.topUp[side] > 0
    )
    if (topUps.length > 0) {
      if (!options.funderId)
        throw new APIError(400, 'A funderId is required to pay the top-up')
      const funder = await pgTrans.oneOrNone<{ id: string; balance: number }>(
        `select id, balance from users where id = $1 for update`,
        [options.funderId]
      )
      const total = options.topUp.long + options.topUp.short
      if (!funder) throw new APIError(404, `User ${options.funderId} not found`)
      if (!Number.isFinite(funder.balance) || funder.balance < total)
        throw new APIError(
          403,
          `Insufficient balance for the top-up: needed ${total}, have ${funder.balance}`
        )
      for (const side of topUps)
        await runTxnOutsideBetQueue(pgTrans, {
          category: 'ADD_SUBSIDY',
          fromId: options.funderId,
          fromType: 'USER',
          toId: contractId,
          toType: 'CONTRACT',
          amount: options.topUp[side],
          token: 'M$',
          data: { side, reason: 'perp-protected-activation-top-up' },
        })
    }

    const epoch = accounting.epoch + 1
    const finalState = plan.finalState
    const nextAccounting: PerpAccounting = {
      ...accounting,
      mode: 'protected',
      epoch,
    }

    // 1. Immutable record; 2. present the NEW epoch (the contract guard
    // requires it for any pool change on a protected row, and the flip below
    // carries the top-up); 3. version flip (transition-guarded).
    await pgTrans.none(
      insertAccountingEpochQuery({
        contractId,
        epoch,
        accountingMode: 'protected',
        previousMode: accounting.mode,
        oraclePrice: price,
        oraclePriceTime: contract.oraclePriceTime ?? null,
        poolLong: plan.backfilledState.pool.L,
        poolShort: plan.backfilledState.pool.S,
        topUpLong: options.topUp.long,
        topUpShort: options.topUp.short,
        reducedAnyBasis: plan.reducedAnyBasis,
        positionSnapshot: epochRecordSnapshot(
          state.positions,
          finalState.positions
        ),
        data: {
          actorId,
          allocation: options.allocation,
          confirmedPlan: options.confirmedPlan ?? null,
          planDigest,
          fingerprint,
          trims: plan.trims,
          activationAdl: plan.activationAdl
            ? {
                adlFactorLong: plan.activationAdl.adlFactorLong,
                adlFactorShort: plan.activationAdl.adlFactorShort,
                settled: plan.activationAdl.settled.length,
                adjusted: plan.activationAdl.adjusted.length,
              }
            : null,
          invariantErrorsBeforeAdl: plan.invariantErrors,
        },
      })
    )
    const contractPatch = removeUndefinedProps({
      perpAccountingMode: 'protected',
      perpAccountingEpoch: epoch,
      poolLong: finalState.pool.L,
      poolShort: finalState.pool.S,
      ...openInterestPatch(finalState.positions),
      lastUpdatedTime: now,
    })
    await pgTrans.one(presentAccountingEpochQuery(epoch))
    await pgTrans.one(presentAccountingTransitionQuery())
    await pgTrans.one(mergeContractDataQuery(contractId, contractPatch))

    // 4. Every live row is rewritten: even an unchanged b needs the explicit
    // column and the new epoch stamp. Rows removed by the activation ADL are
    // deleted; their protected basis is paid once.
    const diff = diffForWrite(state.positions, finalState.positions)
    const upserts = finalState.positions.filter((p) => p.size > 0)
    const events: PerpEvent[] = [
      activationEvent(
        contract,
        accounting.mode,
        'protected',
        epoch,
        now,
        price,
        {
          actorId,
          topUp: options.topUp,
          allocation: options.allocation,
          confirmedPlan: options.confirmedPlan ?? null,
          planDigest,
          fingerprint,
          trims: plan.trims,
          reducedAnyBasis: plan.reducedAnyBasis,
        }
      ),
      // One immutable, user-attributed receipt per row whose b the activation
      // set below c (last-resort allocation only): the same shape as a basis
      // settlement, so the position history explains it the same way.
      ...perpActivationReductions(plan).map((a) =>
        asEvent(contract, {
          userId: a.userId,
          eventType: 'basis-settlement',
          direction: a.direction,
          leverage: null,
          sizeDelta: 0,
          costBasisDelta: 0,
          reserveBasisDelta: a.reserveBasisAfter - a.reserveBasisBefore,
          originalCostBasisDelta: 0,
          data: {
            trigger: 'activation',
            reserveBasisBefore: a.reserveBasisBefore,
            reserveBasisAfter: a.reserveBasisAfter,
            costBasis: a.costBasis,
            cutoverMark: price,
            epoch,
            allocation: options.allocation,
            reason: 'basis-settlement',
          },
          appliedTime: now,
          ts: now,
          oraclePrice: price,
        })
      ),
    ]
    if (plan.activationAdl) {
      events.push(
        ...buildAdlEvents(
          contract,
          plan.activationAdl.adjusted,
          plan.activationAdl.settled,
          plan.activationAdl.adlFactorLong,
          plan.activationAdl.adlFactorShort,
          now,
          now,
          price
        )
      )
      await payAdlSettlements(
        pgTrans,
        contractId,
        price,
        plan.activationAdl.settled
      )
    }
    assertPerpProtectedState(finalState, price)
    // Committed pools must hold every reserve they promise in real
    // arithmetic — not within the invariant's tolerance. The plan's dust
    // trim guarantees it; this is the fail-closed proof.
    const finalSnapshot = getPerpAccountingSnapshot(finalState, price)
    for (const side of ['long', 'short'] as const)
      if (finalSnapshot[side].reservedBasis > finalSnapshot[side].pool)
        throw new APIError(
          500,
          `${side} pool ${finalSnapshot[side].pool} would be committed below its reserves ${finalSnapshot[side].reservedBasis}; refusing`
        )
    await assertPerpEscrowBalance(pgTrans, contractId, finalState.pool)

    const affectedUsers = Array.from(
      new Set([
        ...state.positions.map((p) => p.userId),
        ...finalState.positions.map((p) => p.userId),
      ])
    )
    const metricsQuery = await buildPerpUserContractMetricsQuery(pgTrans, {
      contract: { ...contract, ...contractPatch } as PerpContract,
      userIds: affectedUsers,
      newEvents: events,
      finalPositions: finalState.positions,
    })
    const quote = (value: string) => `'${value.replace(/'/g, "''")}'`
    await pgTrans.multi(
      [
        `delete from contract_perp_positions where contract_id = ${quote(
          contractId
        )} and (user_id, direction) in (${
          diff.deletes.length
            ? diff.deletes
                .map((d) => `(${quote(d.userId)}, '${d.direction}')`)
                .join(',')
            : "('', '')"
        })`,
        upsertPositionsQuery(upserts, nextAccounting),
        insertPerpEventsQuery(events, nextAccounting),
        // The shadow checkpoint belongs to the previous epoch; b is live now.
        deleteShadowCheckpointQuery(contractId),
        metricsQuery,
      ].join(';\n')
    )
    log(
      `[perps][accounting] ${contract.slug}: ${
        accounting.mode
      } -> protected (epoch ${epoch}) by ${actorId}; topUp=${JSON.stringify(
        options.topUp
      )} allocation=${options.allocation} reducedAnyBasis=${
        plan.reducedAnyBasis
      } reductions=${perpActivationReductions(plan).length} activationAdl=${
        plan.activationAdl ? 'yes' : 'no'
      }`
    )
    return { contract, epoch, plan }
  })

export type PerpDowngradeReport = {
  allowed: boolean
  blockers: string[]
  accounting: PerpAccounting
  eventsSinceActivation: number
}

const loadDowngradeEvidence = async (
  pg: Pick<SupabaseDirectClient, 'manyOrNone' | 'oneOrNone'>,
  contractId: string,
  accounting: PerpAccounting,
  positions: PerpPosition[]
): Promise<PerpDowngradeReport> => {
  if (accounting.mode === 'legacy')
    return {
      allowed: false,
      blockers: ['already legacy'],
      accounting,
      eventsSinceActivation: 0,
    }
  const record = await pg.oneOrNone<{ reduced_any_basis: boolean }>(
    `select reduced_any_basis from contract_perp_accounting_epochs
      where contract_id = $1 and epoch = $2`,
    [contractId, accounting.epoch]
  )
  const rows = await pg.manyOrNone<{
    id: number | string
    event_type: string
    cost_basis_delta: number | string
    reserve_basis_delta: number | string
    data: Record<string, unknown> | null
  }>(
    `select id, event_type, cost_basis_delta, reserve_basis_delta, data
       from contract_perp_events
      where contract_id = $1 and accounting_epoch = $2
      order by id`,
    [contractId, accounting.epoch]
  )
  const events: PerpEvent[] = rows.map((r) => ({
    id: Number(r.id),
    contractId,
    userId: null,
    eventType: r.event_type as PerpEvent['eventType'],
    appliedTime: 0,
    ts: 0,
    oraclePrice: 0,
    sizeDelta: 0,
    costBasisDelta: Number(r.cost_basis_delta),
    reserveBasisDelta: Number(r.reserve_basis_delta),
    originalCostBasisDelta: 0,
    direction: null,
    leverage: null,
    data: r.data ?? undefined,
  }))
  const verification = verifyPerpAccountingDowngrade({
    positions,
    eventsSinceActivation: events,
    activationReducedBasis: record?.reduced_any_basis ?? false,
  })
  if (!record)
    verification.blockers.push(
      `no immutable record for epoch ${accounting.epoch}`
    )
  return {
    allowed: verification.blockers.length === 0,
    blockers: verification.blockers,
    accounting,
    eventsSinceActivation: events.length,
  }
}

/** Read-only: may this contract return to legacy accounting? */
export const verifyPerpAccountingDowngradeForContract = async (
  pg: SupabaseDirectClient,
  contractId: string
): Promise<PerpDowngradeReport> => {
  const contract = await loadContractReadOnly(pg, contractId)
  const accounting = readPerpAccounting(contract)
  const positions = await loadPositionsReadOnly(pg, contractId, accounting)
  return loadDowngradeEvidence(pg, contractId, accounting, positions)
}

/**
 * shadow -> legacy, or protected -> legacy ONLY while the immutable records
 * prove nothing v2-divergent happened (every live b = c, no basis
 * settlement, no partial close, no divergent Δb, no activation reduction).
 * After the first divergent mutation the answer is halt and forward-fix,
 * never this.
 */
export const downgradePerpAccountingToLegacy = async (
  contractId: string,
  actorId: string
) =>
  runPerpTransaction(async (pgTrans: SupabaseTransaction) => {
    const { contract, state, accounting } = await loadPerpStateForUpdate(
      pgTrans,
      contractId
    )
    assertTransition(accounting, 'legacy', state, contract)
    const evidence = await loadDowngradeEvidence(
      pgTrans,
      contractId,
      accounting,
      state.positions
    )
    if (!evidence.allowed)
      throw new APIError(
        409,
        `Cannot return ${
          contract.slug
        } to legacy accounting: ${evidence.blockers.join('; ')}`
      )
    const now = Date.now()
    const epoch = accounting.epoch + 1
    await pgTrans.none(
      insertAccountingEpochQuery({
        contractId,
        epoch,
        accountingMode: 'legacy',
        previousMode: accounting.mode,
        oraclePrice: contract.oraclePrice,
        oraclePriceTime: contract.oraclePriceTime ?? null,
        poolLong: state.pool.L,
        poolShort: state.pool.S,
        topUpLong: 0,
        topUpShort: 0,
        reducedAnyBasis: false,
        positionSnapshot: epochRecordSnapshot(state.positions, state.positions),
        data: { actorId, eventsVerified: evidence.eventsSinceActivation },
      })
    )
    await pgTrans.one(presentAccountingTransitionQuery())
    await pgTrans.one(
      mergeContractDataQuery(contractId, {
        perpAccountingMode: 'legacy',
        perpAccountingEpoch: epoch,
        perpBasisDeficit: 0,
        perpReducedBasisCount: 0,
        lastUpdatedTime: now,
      })
    )
    await pgTrans.none(
      insertPerpEventsQuery(
        [
          activationEvent(
            contract,
            accounting.mode,
            'legacy',
            epoch,
            now,
            contract.oraclePrice,
            { actorId }
          ),
        ],
        { ...accounting, mode: 'legacy', epoch }
      )
    )
    await pgTrans.none(deleteShadowCheckpointQuery(contractId))
    log(
      `[perps][accounting] ${contract.slug}: ${accounting.mode} -> legacy (epoch ${epoch}) by ${actorId}`
    )
    return { contract, epoch }
  })

/**
 * Delete the shadow checkpoint under the contract lock so the next committed
 * transition seeds a fresh one from the live state. The remedy for a
 * checkpoint write that failed (its ERROR line says so): the cumulative
 * replay for the epoch has a gap and cannot be trusted; counters restart.
 * Diagnostic state only — no ledger, position, event or pool is touched.
 */
export const reseedPerpAccountingShadow = async (
  contractId: string,
  actorId: string
) =>
  runPerpTransaction(async (pgTrans: SupabaseTransaction) => {
    const { contract, accounting } = await loadPerpStateForUpdate(
      pgTrans,
      contractId
    )
    if (accounting.mode !== 'shadow')
      throw new APIError(
        409,
        `${contract.slug} is in ${accounting.mode} accounting; only a shadow contract has a checkpoint to re-seed`
      )
    await pgTrans.none(deleteShadowCheckpointQuery(contractId))
    log(
      `[perps][accounting] ${contract.slug}: shadow checkpoint for epoch ${accounting.epoch} deleted by ${actorId}; the next transition re-seeds it from live`
    )
    return { contract, epoch: accounting.epoch }
  })
