// Per-contract mechanics versioning for ManiPerp protected-basis settlement.
//
// Two INDEPENDENT controls, both persisted on the contract's `data` jsonb
// (the same place #4030 keeps `solvencyHaltTime`), read under the contract
// advisory lock by every engine transition:
//
//   perpAccountingMode   legacy | shadow | protected   (Workstream A)
//   perpRiskPolicyMode   off | shadow | enforce        (Workstream B)
//
// An ABSENT value is the safe default (`legacy` / `off`); an UNKNOWN value
// fails closed by throwing, so a typo in a hand-edited row halts the market
// rather than silently selecting either semantics. The two are deliberately
// not coupled: accounting `shadow` computes protected-basis diagnostics while
// committing legacy ledgers, and risk-policy `shadow` computes candidate
// admission/allowance policies while committing the compatibility policy.
// Neither `shadow` may ever change what is persisted.
//
// `perpAccountingEpoch` increments on every accounting-mode transition and is
// stamped on every position mutation and event from then on. The database
// guard (see backend/supabase/migrations/2026090201_perp_protected_basis.sql)
// requires a protected contract's writer to present the current epoch in the
// same transaction, which is what makes a literal old binary unable to touch
// protected rows — a stale in-process flag is not the enforcement boundary.

export const PERP_ACCOUNTING_MODES = ['legacy', 'shadow', 'protected'] as const
export type PerpAccountingMode = (typeof PERP_ACCOUNTING_MODES)[number]

export const PERP_RISK_POLICY_MODES = ['off', 'shadow', 'enforce'] as const
export type PerpRiskPolicyMode = (typeof PERP_RISK_POLICY_MODES)[number]

/** The subset of contract fields the accounting reads depend on. */
export type PerpAccountingConfig = {
  perpAccountingMode?: string | null
  perpAccountingEpoch?: number | null
  perpRiskPolicyMode?: string | null
}

export type PerpAccounting = {
  mode: PerpAccountingMode
  /** 0 for a contract that has never left legacy. */
  epoch: number
  riskPolicyMode: PerpRiskPolicyMode
}

export const isPerpAccountingMode = (
  value: unknown
): value is PerpAccountingMode =>
  typeof value === 'string' &&
  (PERP_ACCOUNTING_MODES as readonly string[]).includes(value)

export const isPerpRiskPolicyMode = (
  value: unknown
): value is PerpRiskPolicyMode =>
  typeof value === 'string' &&
  (PERP_RISK_POLICY_MODES as readonly string[]).includes(value)

/** Absent -> legacy. Anything else that is not a known mode throws. */
export const getPerpAccountingMode = (
  contract: PerpAccountingConfig
): PerpAccountingMode => {
  const raw = contract.perpAccountingMode
  if (raw === undefined || raw === null) return 'legacy'
  if (!isPerpAccountingMode(raw))
    throw new Error(`Unknown perp accounting mode ${JSON.stringify(raw)}`)
  return raw
}

/** Absent -> 0. Must be a non-negative safe integer. */
export const getPerpAccountingEpoch = (contract: PerpAccountingConfig) => {
  const raw = contract.perpAccountingEpoch
  if (raw === undefined || raw === null) return 0
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0)
    throw new Error(`Invalid perp accounting epoch ${JSON.stringify(raw)}`)
  return raw
}

/**
 * Absent -> off. `enforce` is REJECTED by this build: Workstream A ships no
 * enforcement path for any candidate policy, so a contract asking for one is
 * asking for behaviour this binary cannot provide, and the only safe answer
 * is to stop rather than to quietly run the compatibility policy under a
 * label that says otherwise.
 */
export const getPerpRiskPolicyMode = (
  contract: PerpAccountingConfig
): PerpRiskPolicyMode => {
  const raw = contract.perpRiskPolicyMode
  if (raw === undefined || raw === null) return 'off'
  if (!isPerpRiskPolicyMode(raw))
    throw new Error(`Unknown perp risk policy mode ${JSON.stringify(raw)}`)
  if (raw === 'enforce')
    throw new Error(
      'Perp risk policy "enforce" is not implemented in this build (Workstream B is shadow-only)'
    )
  return raw
}

export const readPerpAccounting = (
  contract: PerpAccountingConfig
): PerpAccounting => {
  const mode = getPerpAccountingMode(contract)
  const epoch = getPerpAccountingEpoch(contract)
  // A protected or shadow contract without an epoch has no activation record
  // to anchor its rows to, which the guard could not enforce; fail closed.
  if (mode !== 'legacy' && epoch <= 0)
    throw new Error(
      `Perp accounting mode ${mode} requires a positive accounting epoch`
    )
  return { mode, epoch, riskPolicyMode: getPerpRiskPolicyMode(contract) }
}

export const isProtectedPerpAccounting = (accounting: {
  mode: PerpAccountingMode
}) => accounting.mode === 'protected'

/**
 * Legal mode transitions. Existing live contracts must go
 * legacy -> shadow -> protected; an empty contract may start protected at
 * genesis. Protected -> legacy is not a mode flip at all — it requires the
 * downgrade verifier (see protected-migration.ts) and is expressed here only
 * so the tooling can name it.
 */
export const isAllowedPerpAccountingTransition = (
  from: PerpAccountingMode,
  to: PerpAccountingMode,
  options: { hasOpenPositions: boolean }
) => {
  if (from === to) return false
  if (from === 'legacy' && to === 'shadow') return true
  if (from === 'shadow' && to === 'protected') return true
  if (from === 'legacy' && to === 'protected') return !options.hasOpenPositions
  if (from === 'shadow' && to === 'legacy') return true
  if (from === 'protected' && to === 'legacy') return true // verifier-gated
  return false
}
