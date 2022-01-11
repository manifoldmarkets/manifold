export const PHANTOM_ANTE = 200

export const calcStartPool = (initialProbInt: number, ante = 0) => {
  const p = initialProbInt / 100.0
  const totalAnte = PHANTOM_ANTE + ante

  const sharesYes = Math.sqrt(p * totalAnte ** 2)
  const sharesNo = Math.sqrt(totalAnte ** 2 - sharesYes ** 2)

  const poolYes = p * ante
  const poolNo = (1 - p) * ante

  const startYes = Math.sqrt(p) * PHANTOM_ANTE
  const startNo = Math.sqrt(1 - p) * PHANTOM_ANTE

  return { sharesYes, sharesNo, poolYes, poolNo, startYes, startNo }
}
