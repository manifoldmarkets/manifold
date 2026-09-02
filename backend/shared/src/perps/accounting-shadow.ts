// Persistence side of the accounting shadow (common/perps/accounting-shadow)
// and of the Workstream B risk-policy shadow. Both write ONLY to their
// isolated tables, inside a SAVEPOINT, and swallow every error: a diagnostic
// must never change, delay, or roll back the financial transaction it rides
// along with.

import { PerpContract } from 'common/contract'
import { PerpAccounting } from 'common/perps/accounting-mode'
import {
  advancePerpShadowCheckpoint,
  parsePerpShadowCheckpoint,
  PerpShadowTransitionInput,
  seedPerpShadowCheckpoint,
} from 'common/perps/accounting-shadow'
import { PerpState } from 'common/perps/amm'
import { SupabaseTransaction } from 'shared/supabase/init'
import { log } from 'shared/utils'
import {
  selectShadowCheckpointQuery,
  upsertRiskShadowQuery,
  upsertShadowCheckpointQuery,
} from './queries'

/**
 * Advance the contract's shadow checkpoint by the transition the engine just
 * computed. No-op unless the contract is in accounting `shadow`. Reads the
 * checkpoint under the same contract lock the engine already holds, applies
 * the protected counterpart, and persists the new checkpoint plus report
 * under a savepoint.
 */
export const recordPerpAccountingShadow = async (
  pgTrans: SupabaseTransaction,
  contract: PerpContract,
  accounting: PerpAccounting,
  input: PerpShadowTransitionInput,
  liveBefore: PerpState,
  liveAfter: PerpState,
  markPrice: number
) => {
  if (accounting.mode !== 'shadow') return
  try {
    const row = await pgTrans.oneOrNone<{
      accounting_epoch: number | string
      state: unknown
    }>(selectShadowCheckpointQuery(contract.id))
    const stored =
      row && Number(row.accounting_epoch) === accounting.epoch
        ? parsePerpShadowCheckpoint(row.state, accounting.epoch)
        : null
    const checkpoint =
      stored ?? seedPerpShadowCheckpoint(liveBefore, accounting.epoch)
    const advanced = advancePerpShadowCheckpoint(
      checkpoint,
      input,
      liveAfter,
      markPrice
    )
    const { report } = advanced
    if (report.divergent || !stored)
      log(
        `[perps][accounting-shadow] ${contract.slug} ${input.kind}: ${
          stored ? '' : 'seeded; '
        }applied=${report.applied}${
          report.error ? ` error="${report.error}"` : ''
        } divergent=${
          report.divergent
        } poolΔ long=${report.poolDifference.long.toFixed(
          4
        )} short=${report.poolDifference.short.toFixed(4)} rowsΔ=${
          report.positionDifferences.length
        } shadow c−b=${report.basisDeficit.toFixed(
          4
        )} liveInvariants=${JSON.stringify(
          report.liveInvariants
        )} shadowInvariants=${JSON.stringify(report.shadowInvariants)}`
      )
    // Savepoint: a failed diagnostic write must not abort the outer
    // transaction (Postgres would otherwise refuse every later statement).
    await pgTrans.tx((sp) =>
      sp.none(
        upsertShadowCheckpointQuery({
          contractId: contract.id,
          accountingEpoch: accounting.epoch,
          state: {
            pool: advanced.checkpoint.pool,
            positions: advanced.checkpoint.positions,
            transitions: advanced.checkpoint.transitions,
            divergences: advanced.checkpoint.divergences,
            reseeds: advanced.checkpoint.reseeds,
          },
          transitions: advanced.checkpoint.transitions,
          divergences: advanced.checkpoint.divergences,
          lastReport: report,
        })
      )
    )
  } catch (error) {
    log.error(
      `[perps][accounting-shadow] ${contract.slug}: shadow ${
        input.kind
      } evaluation failed and was ignored: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}

/** Latest Workstream B evaluation, kept out of the financial event log. */
export const recordPerpRiskShadow = async (
  pgTrans: SupabaseTransaction,
  contract: PerpContract,
  data: Record<string, unknown>
) => {
  try {
    await pgTrans.tx((sp) => sp.none(upsertRiskShadowQuery(contract.id, data)))
  } catch (error) {
    log.error(
      `[perps][risk-shadow] ${
        contract.slug
      }: could not persist the shadow evaluation (ignored): ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}
