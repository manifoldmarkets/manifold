// Pure checks for the PERP cash-backing invariant. The database-facing query
// lives in backend/shared; keeping tolerance math here makes it independently
// testable and prevents accounting callers from choosing looser thresholds.

export type PerpEscrowSnapshot = {
  ledgerBalance: number
  poolLong: number
  poolShort: number
}

const MIN_ESCROW_TOLERANCE = 1e-6
const MAX_ESCROW_TOLERANCE = 1e-3

export const getPerpEscrowTolerance = ({
  ledgerBalance,
  poolLong,
  poolShort,
}: PerpEscrowSnapshot) => {
  if (
    !Number.isFinite(ledgerBalance) ||
    !Number.isFinite(poolLong) ||
    !Number.isFinite(poolShort)
  ) {
    return 0
  }
  const scale = Math.max(
    1,
    Math.abs(ledgerBalance),
    Math.abs(poolLong),
    Math.abs(poolShort)
  )
  return Math.max(
    MIN_ESCROW_TOLERANCE,
    Math.min(MAX_ESCROW_TOLERANCE, 256 * Number.EPSILON * scale)
  )
}

export const getPerpEscrowDifference = ({
  ledgerBalance,
  poolLong,
  poolShort,
}: PerpEscrowSnapshot) => ledgerBalance - (poolLong + poolShort)

export const isPerpEscrowBalanced = (snapshot: PerpEscrowSnapshot) => {
  const { ledgerBalance, poolLong, poolShort } = snapshot
  if (
    !Number.isFinite(ledgerBalance) ||
    !Number.isFinite(poolLong) ||
    !Number.isFinite(poolShort) ||
    poolLong < 0 ||
    poolShort < 0 ||
    !Number.isFinite(poolLong + poolShort)
  ) {
    return false
  }
  return (
    Math.abs(getPerpEscrowDifference(snapshot)) <=
    getPerpEscrowTolerance(snapshot)
  )
}
