// Persistence side of the accounting shadow (common/perps/accounting-shadow)
// and of the Workstream B risk-policy shadow. Both write ONLY to their
// isolated tables and swallow every error: a diagnostic must never change,
// delay, or roll back the financial transaction it rides along with.
//
// Everything that touches the database — the checkpoint read included —
// runs inside a SAVEPOINT (pg-promise nests `tx` as a savepoint). A failing
// statement outside one would leave the outer transaction aborted, and the
// engine's next statement would fail with 25P02 no matter how thoroughly the
// error here was caught.

import { PerpContract } from 'common/contract'
import { PerpAccounting } from 'common/perps/accounting-mode'
import {
  advancePerpShadowCheckpoint,
  parsePerpShadowCheckpoint,
  PerpShadowTransitionInput,
  seedPerpShadowCheckpoint,
} from 'common/perps/accounting-shadow'
import { PerpState } from 'common/perps/amm'
import {
  createSupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { log } from 'shared/utils'
import {
  selectShadowCheckpointQuery,
  upsertRiskShadowQuery,
  upsertShadowCheckpointQuery,
} from './queries'

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

/**
 * Advance the contract's shadow checkpoint by the transition the engine just
 * computed. No-op unless the contract is in accounting `shadow`. Reads the
 * checkpoint under the same contract lock the engine already holds, applies
 * the protected counterpart, and persists the new checkpoint plus report —
 * all under one savepoint.
 *
 * A failure here loses this transition from the cumulative replay: the
 * checkpoint stays where it was while the live book moves on, so every later
 * report for the epoch carries that gap as a divergence. The ERROR line
 * below says so; the remedy is `--reseed-shadow` in the preflight script.
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
    await pgTrans.tx(async (sp) => {
      const row = await sp.oneOrNone<{
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
          }${
            report.payoutDifference === null
              ? ''
              : ` payoutΔ=${report.payoutDifference.toFixed(4)}`
          } shadow c−b=${report.basisDeficit.toFixed(
            4
          )} liveInvariants=${JSON.stringify(
            report.liveInvariants
          )} shadowInvariants=${JSON.stringify(report.shadowInvariants)}`
        )
      await sp.none(
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
    })
  } catch (error) {
    log.error(
      `[perps][accounting-shadow] ${contract.slug}: shadow ${
        input.kind
      } evaluation failed and was ignored; the epoch ${
        accounting.epoch
      } checkpoint is now missing this transition and must be re-seeded (--reseed-shadow): ${describe(
        error
      )}`
    )
  }
}

/**
 * Latest Workstream B evaluation, kept out of the financial event log.
 * Savepoint-isolated; part of the calling transaction's fate otherwise.
 */
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
      }: could not persist the shadow evaluation (ignored): ${describe(error)}`
    )
  }
}

/**
 * The same write for an attempt whose transaction is about to roll back (a
 * compat-rejected open): a detached connection, fire-and-forget, so the
 * rejection is visible in the table and never delays the rejecting request.
 */
export const recordPerpRiskShadowDetached = (
  contract: PerpContract,
  data: Record<string, unknown>
) => {
  try {
    void createSupabaseDirectClient()
      .none(upsertRiskShadowQuery(contract.id, data))
      .catch((error: unknown) =>
        log.error(
          `[perps][risk-shadow] ${
            contract.slug
          }: could not persist the rejected-attempt evaluation (ignored): ${describe(
            error
          )}`
        )
      )
  } catch (error) {
    log.error(
      `[perps][risk-shadow] ${
        contract.slug
      }: no detached connection for the rejected-attempt evaluation (ignored): ${describe(
        error
      )}`
    )
  }
}
