import { Bet } from 'common/bet'
import { groupBy, mapValues } from 'lodash'

export const getMultiBetPointsFromBets = (bets: Bet[]) => {
  return mapValues(groupBy(bets, 'answerId'), (bets) =>
    bets.map((bet) => ({ x: bet.createdTime, y: bet.probAfter }))
  )
}
