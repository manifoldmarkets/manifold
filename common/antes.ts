import { Bet } from './bet'
import { getProbability } from './calculate'
import { Contract } from './contract'
import { User } from './user'

export const PHANTOM_ANTE = 200

export const calcStartPool = (initialProbInt: number, ante = 0) => {
  const p = initialProbInt / 100.0
  const totalAnte = PHANTOM_ANTE + ante

  const sharesYes = Math.sqrt(p * totalAnte ** 2)
  const sharesNo = Math.sqrt(totalAnte ** 2 - sharesYes ** 2)

  const poolYes = p * ante
  const poolNo = (1 - p) * ante

  const phantomYes = Math.sqrt(p) * PHANTOM_ANTE
  const phantomNo = Math.sqrt(1 - p) * PHANTOM_ANTE

  return { sharesYes, sharesNo, poolYes, poolNo, phantomYes, phantomNo }
}

export function getAnteBets(
  creator: User,
  contract: Contract,
  yesAnteId: string,
  noAnteId: string
) {
  const p = getProbability(contract.totalShares)
  const ante = contract.totalBets.YES + contract.totalBets.NO

  const yesBet: Bet = {
    id: yesAnteId,
    userId: creator.id,
    contractId: contract.id,
    amount: p * ante,
    shares: Math.sqrt(p) * ante,
    outcome: 'YES',
    probBefore: p,
    probAfter: p,
    createdTime: Date.now(),
  }

  const noBet: Bet = {
    id: noAnteId,
    userId: creator.id,
    contractId: contract.id,
    amount: (1 - p) * ante,
    shares: Math.sqrt(1 - p) * ante,
    outcome: 'NO',
    probBefore: p,
    probAfter: p,
    createdTime: Date.now(),
  }

  return { yesBet, noBet }
}
