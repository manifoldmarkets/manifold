import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { SportsContract } from 'common/contract'
import {
  HOUSE_LIQUIDITY_PROVIDER_ID,
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { getLiveScores } from './get-sports-live-scores'

import { convertContract } from 'common/supabase/contracts'
import { convertUser } from 'common/supabase/users'
import { ENV } from 'common/envs/constants'

export async function resolveSportsMarkets() {
  const pg = createSupabaseDirectClient()

  try {
    const liveGames = await getLiveScores()

    const completedGames = liveGames.filter((game) => game.strStatus === 'FT')
    log(`Processing ${completedGames.length} completed games.`)

    if (completedGames.length === 0) {
      log('No completed games to process.')
      return
    }

    const completedGameIds = completedGames.map((game) => game.idEvent)

    const unresolvedContracts = await pg.map(
      `
  SELECT *
  FROM contracts
  WHERE resolution IS NULL
    AND data->>'sportsEventId' IN (${completedGameIds
      .map((_, i) => `$${i + 1}`)
      .join(', ')})
  `,
      completedGameIds,
      (row) => convertContract<SportsContract>(row)
    )

    log(`Found ${unresolvedContracts.length} unresolved contracts.`)

    if (unresolvedContracts.length === 0) {
      log('No matching contracts to resolve.')
      return
    }

    const resolverRow = await pg.one('SELECT * FROM users WHERE id = $1', [
      ENV === 'DEV'
        ? DEV_HOUSE_LIQUIDITY_PROVIDER_ID
        : HOUSE_LIQUIDITY_PROVIDER_ID,
    ])
    const resolver = convertUser(resolverRow)

    for (const game of completedGames) {
      const matchingContracts = unresolvedContracts.filter(
        (c) => c.sportsEventId === game.idEvent
      )

      if (matchingContracts.length === 0) continue

      log(
        `Found ${matchingContracts.length} contracts for game ${game.idEvent}`
      )

      const homeScore = game.intHomeScore
      const awayScore = game.intAwayScore
      const isNBA = game.idLeague === '4387'

      if (homeScore == null || awayScore == null) {
        log(`Skipping game ${game.idEvent}: Missing scores.`)
        continue
      }

      if (isNBA && homeScore === awayScore) {
        log(
          `Skipping contract resolution for game ${game.idEvent}: NBA games cannot end in a draw.`
        )
        continue
      }

      for (const contract of matchingContracts) {
        try {
          if (contract.mechanism !== 'cpmm-multi-1') continue
          const multiContract = contract
          const { answers, sportsLeague } = multiContract
          const isEPL = sportsLeague === 'English Premier League'

          if (homeScore > awayScore) {
            const homeAnswer = answers[0]
            if (!homeAnswer) {
              log(`Contract ${contract.id}: Missing home answer. Skipping.`)
              continue
            }
            log(`Resolving contract ${contract.id} (Home win).`)
            await resolveMarketHelper(multiContract, resolver, resolver, {
              outcome: 'CHOOSE_ONE',
              answerId: homeAnswer.id,
              resolutions: { [homeAnswer.id]: 100 },
            })
          } else if (awayScore > homeScore) {
            const awayAnswer = answers[1]
            if (!awayAnswer) {
              log(`Contract ${contract.id}: Missing away answer. Skipping.`)
              continue
            }
            log(`Resolving contract ${contract.id} (Away win).`)
            await resolveMarketHelper(multiContract, resolver, resolver, {
              outcome: 'CHOOSE_ONE',
              answerId: awayAnswer.id,
              resolutions: { [awayAnswer.id]: 100 },
            })
          } else {
            if (isEPL) {
              const drawAnswer = answers[2]
              if (!drawAnswer) {
                log(`Contract ${contract.id}: Missing draw answer. Skipping.`)
                continue
              }
              log(`Resolving contract ${contract.id} (EPL => Draw).`)
              await resolveMarketHelper(multiContract, resolver, resolver, {
                outcome: 'CHOOSE_ONE',
                answerId: drawAnswer.id,
                resolutions: { [drawAnswer.id]: 100 },
              })
            } else {
              const homeAnswer = answers[0]
              const awayAnswer = answers[1]
              if (!homeAnswer || !awayAnswer) {
                log(
                  `Contract ${contract.id}: Missing home or away answer. Skipping.`
                )
                continue
              }
              log(`Resolving contract ${contract.id} (Tie => 50:50).`)
              await resolveMarketHelper(multiContract, resolver, resolver, {
                outcome: 'CHOOSE_MULTIPLE',
                resolutions: {
                  [homeAnswer.id]: 50,
                  [awayAnswer.id]: 50,
                },
              })
            }
          }

          log(`Successfully resolved contract ${contract.id}.`)
        } catch (error) {
          log(`Error resolving contract ${contract.id}: ${error}`)
        }
      }
    }
  } catch (error) {
    log(`Error in resolveSportsMarkets: ${error}`)
  }
}
