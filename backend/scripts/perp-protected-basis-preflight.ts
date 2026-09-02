// Protected-basis accounting: read-only simulator, migration preflight, and
// the ONLY sanctioned path for changing a perp contract's accounting mode.
//
// READ-ONLY by default. Every mutating action needs an explicit
// `--confirm=<TOKEN>` and runs under the engine's contract lock in one
// transaction, writing the immutable epoch record before the version flip
// (the database refuses a flip without one). Nothing here touches production
// unless you point it there on purpose; run against DEV first.
//
//   # Stage 0: report every live perp (B, C, Rc, top-up, R/E/D/H, invariants,
//   #          compat vs candidate admission, exact-stress, alpha projections)
//   npx ts-node perp-protected-basis-preflight.ts
//   npx ts-node perp-protected-basis-preflight.ts --contract=<id|slug>
//
//   # legacy -> shadow (single-transition diagnostics only; ledger unchanged)
//   npx ts-node perp-protected-basis-preflight.ts --contract=<id> --activate-shadow --confirm=PERP_ACCOUNTING_SHADOW
//
//   # shadow -> protected at the contract's committed mark. ALWAYS dry-run
//   # first: it prints the exact per-user reserve bases and reductions the
//   # activation would commit at the current mark, without writing.
//   npx ts-node perp-protected-basis-preflight.ts --contract=<id> --activate-protected --dry-run \
//       [--top-up-long=N --top-up-short=N] [--last-resort-allocation] [--allow-activation-adl]
//   npx ts-node perp-protected-basis-preflight.ts --contract=<id> --activate-protected \
//       [--top-up-long=N --top-up-short=N --funder=<userId>] \
//       [--last-resort-allocation --confirm-last-resort-mark=<mark from the dry run>] \
//       [--allow-activation-adl] [--allow-stale-mark] \
//       --confirm=PERP_ACCOUNTING_PROTECTED
//
//   # rollback boundary: may this contract return to legacy?
//   npx ts-node perp-protected-basis-preflight.ts --contract=<id> --verify-downgrade
//   npx ts-node perp-protected-basis-preflight.ts --contract=<id> --downgrade-legacy --confirm=PERP_ACCOUNTING_LEGACY
//
//   # Workstream B shadow knob (also available via update-perp-config)
//   npx ts-node perp-protected-basis-preflight.ts --contract=<id> --risk-policy=shadow|off --confirm=PERP_RISK_POLICY
//
// The activation runbook (deploy order, maintenance window, halt clearing) is
// in perps-launch-runbook.md, "Protected-basis accounting".

import { PerpContract } from 'common/contract'
import { getPerpAccountingMode } from 'common/perps/accounting-mode'
import { PERP_ADMISSION_POLICY_CANDIDATE } from 'common/perps/risk-policy-shadow'
import { getLocalEnv } from 'shared/init-admin'
import {
  activatePerpAccountingProtected,
  activatePerpAccountingShadow,
  downgradePerpAccountingToLegacy,
  dryRunPerpAccountingProtected,
  PerpProtectedActivationDryRun,
  PerpProtectedSimulation,
  simulatePerpProtectedAccounting,
  verifyPerpAccountingDowngradeForContract,
} from 'shared/perps/accounting'
import { updateContract } from 'shared/supabase/contracts'
import { log } from 'shared/utils'
import { runScript } from './run-script'

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const flag = (name: string) => process.argv.includes(`--${name}`)

const contractArg = arg('contract')
const confirm = arg('confirm')
const actorId = arg('actor') ?? 'perp-protected-basis-preflight'

const money = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : String(n))

const printSimulation = (sim: PerpProtectedSimulation) => {
  const lines: string[] = []
  lines.push(
    `== ${sim.slug} (${sim.contractId}) accounting=${sim.accounting.mode} epoch=${sim.accounting.epoch} risk=${sim.accounting.riskPolicyMode}` +
      (sim.solvencyHalted ? ' SOLVENCY-HALTED' : '') +
      ` mark=${sim.oraclePrice} fresh=${sim.oracleFresh} positions=${sim.positionCount}`
  )
  for (const side of ['long', 'short'] as const) {
    const m = sim.migration[side]
    const s = sim.snapshot[side]
    const inv = sim.invariants[side]
    lines.push(
      `  ${side.padEnd(5)} B=${money(m.pool)} C=Σc=${money(
        m.costBasisTotal
      )} Rc=${money(m.currentClaims)} class=${m.class} topUp=${money(
        m.requiredTopUp
      )}`
    )
    lines.push(
      `        R=${money(s.ownClaims)} E=${money(s.contingentClaims)} D=${money(
        s.paperLosses
      )} H=${money(s.unreserved)} Σb=${money(s.reservedBasis)} reduced=${
        s.reducedBasisCount
      } c−b=${money(s.basisDeficit)} poolCoversReserves=${
        inv.poolCoversReserves
      } contingentBacked=${inv.contingentClaimsBacked}`
    )
    const a = sim.admission[side]
    lines.push(
      `        admission compat(U=M=10) limit=${money(
        a.compat.limit
      )} headroom=${money(a.compat.headroom)} within=${
        a.compat.isWithinLimit
      } | candidate(U=${
        PERP_ADMISSION_POLICY_CANDIDATE.unreservedMultiple
      }) limit=${money(a.candidate.limit)} headroom=${money(
        a.candidate.headroom
      )} stricter=${a.candidateStricter} | exact margin=${money(
        a.exact.margin
      )} passes=${
        a.exact.passes
      } impliedAdl=${a.exact.impliedStressAdlFactor.toFixed(4)} disagrees=${
        a.exactDisagrees
      }`
    )
  }
  for (const alpha of sim.claimAllowance)
    lines.push(
      `  alpha=${alpha.alpha}: long factor=${alpha.long.factor.toFixed(
        4
      )} projectedAdl=${money(
        alpha.long.projectedAdlAmount
      )} | short factor=${alpha.short.factor.toFixed(4)} projectedAdl=${money(
        alpha.short.projectedAdlAmount
      )}`
    )
  const full = sim.activationAtFullBasis
  lines.push(
    `  activation at b=c with required top-up (${money(
      sim.migration.requiredTopUp
    )}): ${full.ok ? 'OK' : 'BLOCKED: ' + full.blockers.join('; ')}`
  )
  if (!full.ok) {
    const adl = sim.activationWithAdl
    lines.push(
      `  ...with activation ADL: ${
        adl.ok
          ? `OK (factors long=${adl.activationAdl?.adlFactorLong ?? 1} short=${
              adl.activationAdl?.adlFactorShort ?? 1
            })`
          : 'BLOCKED: ' + adl.blockers.join('; ')
      }`
    )
  }
  if (sim.shadow)
    lines.push(
      `  shadow checkpoint (epoch ${sim.shadow.epoch}): transitions=${
        sim.shadow.transitions
      } divergences=${sim.shadow.divergences} reseeds=${
        sim.shadow.reseeds
      } shadow c−b=${money(sim.shadow.basisDeficit)} reducedRows=${
        sim.shadow.reducedBasisCount
      } updated=${new Date(sim.shadow.updatedTime).toISOString()}`
    )
  lines.push(
    `  history: events=${sim.history.eventCount} first=${
      sim.history.firstEventTime === null
        ? 'none'
        : new Date(sim.history.firstEventTime).toISOString()
    } withoutBasisHistory=${
      sim.history.eventsWithoutBasisHistory
    } replay=not attempted (prospective b = c is the default policy)`
  )
  console.log(lines.join('\n'))
}

runScript(async ({ pg }) => {
  log(`env: ${getLocalEnv()}`)

  const resolveContract = async () => {
    if (!contractArg) return null
    const row = await pg.oneOrNone<{ id: string; data: PerpContract }>(
      `select id, data from contracts
        where mechanism = 'perp' and (id = $1 or slug = $1)`,
      [contractArg]
    )
    if (!row) throw new Error(`No perp contract matches ${contractArg}`)
    return row
  }

  const target = await resolveContract()

  if (flag('activate-shadow')) {
    if (!target) throw new Error('--contract is required')
    if (confirm !== 'PERP_ACCOUNTING_SHADOW')
      throw new Error(
        'Pass --confirm=PERP_ACCOUNTING_SHADOW to activate shadow accounting'
      )
    const result = await activatePerpAccountingShadow(target.id, actorId)
    console.log(
      `shadow accounting active on ${result.contract.slug} at epoch ${result.epoch}`
    )
    printSimulation(await simulatePerpProtectedAccounting(pg, target.id))
    return
  }

  if (flag('activate-protected')) {
    if (!target) throw new Error('--contract is required')
    const topUp = {
      long: Number(arg('top-up-long') ?? 0),
      short: Number(arg('top-up-short') ?? 0),
    }
    const planOptions = {
      topUp,
      allocation: flag('last-resort-allocation')
        ? ('last-resort-snapshot' as const)
        : ('full-basis' as const),
      allowActivationAdl: flag('allow-activation-adl'),
    }
    const printDryRun = (dry: PerpProtectedActivationDryRun) => {
      console.log(
        `dry run ${dry.slug}: mark=${dry.mark} (${
          dry.markFresh ? 'fresh' : 'STALE'
        }) accounting=${dry.accounting.mode} epoch=${dry.accounting.epoch} ok=${
          dry.plan.ok
        }`
      )
      for (const blocker of dry.plan.blockers)
        console.log(`  BLOCKER: ${blocker}`)
      console.log(
        `  reducedAnyBasis=${dry.plan.reducedAnyBasis} activationAdl=${
          dry.plan.activationAdl
            ? `long=${dry.plan.activationAdl.adlFactorLong} short=${dry.plan.activationAdl.adlFactorShort}`
            : 'none'
        }`
      )
      for (const a of dry.plan.allocations)
        console.log(
          `  ${a.userId} ${a.direction}: c=${money(a.costBasis)} b=${money(
            a.reserveBasisAfter
          )}${
            a.reserveBasisAfter < a.costBasis
              ? ` (REDUCED by ${money(a.costBasis - a.reserveBasisAfter)})`
              : ''
          }`
        )
      if (dry.reductions.length > 0)
        console.log(
          `  ${dry.reductions.length} position(s) would receive b < c; each gets an immutable basis-settlement receipt (trigger=activation). Re-run with --confirm-last-resort-mark=${dry.mark} to execute at exactly this mark.`
        )
    }
    if (flag('dry-run')) {
      printSimulation(await simulatePerpProtectedAccounting(pg, target.id))
      printDryRun(
        await dryRunPerpAccountingProtected(pg, target.id, planOptions)
      )
      return
    }
    if (confirm !== 'PERP_ACCOUNTING_PROTECTED')
      throw new Error(
        'Pass --confirm=PERP_ACCOUNTING_PROTECTED to activate protected accounting (or --dry-run to preview)'
      )
    const before = await simulatePerpProtectedAccounting(pg, target.id)
    printSimulation(before)
    printDryRun(await dryRunPerpAccountingProtected(pg, target.id, planOptions))
    const confirmedMarkArg = arg('confirm-last-resort-mark')
    const result = await activatePerpAccountingProtected(target.id, actorId, {
      ...planOptions,
      allowStaleMark: flag('allow-stale-mark'),
      funderId: arg('funder'),
      confirmedMark:
        confirmedMarkArg === undefined ? undefined : Number(confirmedMarkArg),
    })
    console.log(
      `protected accounting active on ${result.contract.slug} at epoch ${
        result.epoch
      }; reducedAnyBasis=${result.plan.reducedAnyBasis} activationAdl=${
        result.plan.activationAdl ? 'applied' : 'none'
      }`
    )
    printSimulation(await simulatePerpProtectedAccounting(pg, target.id))
    return
  }

  if (flag('verify-downgrade')) {
    if (!target) throw new Error('--contract is required')
    const report = await verifyPerpAccountingDowngradeForContract(pg, target.id)
    console.log(JSON.stringify(report, null, 2))
    return
  }

  if (flag('downgrade-legacy')) {
    if (!target) throw new Error('--contract is required')
    if (confirm !== 'PERP_ACCOUNTING_LEGACY')
      throw new Error(
        'Pass --confirm=PERP_ACCOUNTING_LEGACY to return a contract to legacy accounting'
      )
    const result = await downgradePerpAccountingToLegacy(target.id, actorId)
    console.log(
      `legacy accounting restored on ${result.contract.slug} at epoch ${result.epoch}`
    )
    return
  }

  const riskPolicy = arg('risk-policy')
  if (riskPolicy !== undefined) {
    if (!target) throw new Error('--contract is required')
    if (riskPolicy !== 'off' && riskPolicy !== 'shadow')
      throw new Error(
        '--risk-policy must be off or shadow (enforce is not implemented)'
      )
    if (confirm !== 'PERP_RISK_POLICY')
      throw new Error(
        'Pass --confirm=PERP_RISK_POLICY to change the risk-policy mode'
      )
    // Independent of the accounting mode; a plain data update, no epoch.
    await updateContract(pg, target.id, { perpRiskPolicyMode: riskPolicy })
    console.log(
      `risk policy on ${target.data.slug}: ${riskPolicy} (shadow only; never enforcing)`
    )
    return
  }

  // Default: the read-only report.
  const rows = target
    ? [target]
    : await pg.manyOrNone<{ id: string; data: PerpContract }>(
        `select id, data from contracts where mechanism = 'perp' and resolution_time is null order by created_time`
      )
  let blocked = 0
  for (const row of rows) {
    try {
      const sim = await simulatePerpProtectedAccounting(pg, row.id)
      printSimulation(sim)
      if (!sim.activationAtFullBasis.ok) blocked += 1
    } catch (error) {
      blocked += 1
      console.log(
        `== ${row.data.slug} (${row.id}) accounting=${(() => {
          try {
            return getPerpAccountingMode(row.data)
          } catch {
            return 'INVALID'
          }
        })()} FAILED: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
  console.log(
    `\n${rows.length} contract(s) reported; ${blocked} would need a top-up, an activation ADL approval, or a fix before b = c activation.`
  )
})
