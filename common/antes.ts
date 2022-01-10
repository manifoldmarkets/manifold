export const PHANTOM_ANTE = 200

export const calcStartPool = (initialProbInt: number, ante?: number) => {
  const p = initialProbInt / 100.0
  const totalAnte = PHANTOM_ANTE + (ante || 0)

  const poolYes =
    p === 0.5
      ? p * totalAnte
      : -(totalAnte * (-p + Math.sqrt((-1 + p) * -p))) / (-1 + 2 * p)

  const poolNo = totalAnte - poolYes

  const f = PHANTOM_ANTE / totalAnte
  const startYes = f * poolYes
  const startNo = f * poolNo

  return { startYes, startNo, poolYes, poolNo }
}
