import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { removeUndefinedProps } from 'common/util/object'
import { compressPoints, pointsToBase64 } from 'common/util/og'
import { HistoryPoint } from '../charts/generic-charts'

export function getPointsString(betPoints: HistoryPoint<Partial<Bet>>[]) {
  return pointsToBase64(compressPoints(betPoints))
}

export function getBetPoints(bets: Bet[], includeAvatar: boolean) {
  return bets.map(
    (bet) =>
      removeUndefinedProps({
        x: bet.createdTime,
        y: bet.probAfter,
        obj: includeAvatar ? { userAvatarUrl: bet.userAvatarUrl } : undefined,
      }) as HistoryPoint<Partial<Bet>>
  )
}

export function getUseBetLimit(useBetPoints: boolean) {
  return useBetPoints ? 50000 : 4000
}

export function shouldUseBetPoints(contract?: Contract) {
  return (
    contract?.outcomeType === 'BINARY' ||
    contract?.outcomeType === 'PSEUDO_NUMERIC'
  )
}

export function getHistoryDataBets(useBetPoints: boolean, bets: Bet[]) {
  return useBetPoints ? bets.slice(0, 100) : bets
}
