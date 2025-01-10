import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { Contract, CPMMMultiContract } from 'common/contract'
import { HOUSE_LIQUIDITY_PROVIDER_ID } from 'common/antes'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { SportsGames } from 'common/sports-info'
import { api } from 'web/lib/api/api'

export async function resolveSportsMarkets() {
  const pg = createSupabaseDirectClient()

  try {
    const data = await api('get-completed-sports-games', {})
    const completedGames = (data.schedule || []) as SportsGames[]
    log(`Processing ${completedGames.length} completed games.`)

    const unresolvedContracts = await pg.map<Contract>(
      `
      SELECT *
      FROM contracts
      WHERE resolution IS NULL
        AND data->>'sportsEventId' IS NOT NULL
      `,
      [],
      (row) => row as Contract
    )

    for (const game of completedGames) {
      const matchingContracts = unresolvedContracts.filter(
        (c) => c.sportsEventId === game.idEvent
      )
      if (matchingContracts.length === 0) continue

      log(
        `Found ${matchingContracts.length} contracts for game ${game.idEvent}`
      )

      const resolver = await pg.one('SELECT * FROM users WHERE id = $1', [
        HOUSE_LIQUIDITY_PROVIDER_ID,
      ])
      if (!resolver) {
        log('House account not found. Skipping these contracts.')
        continue
      }

      const homeScore = parseInt(game.homeScore ?? game.homeScore ?? '0')
      const awayScore = parseInt(game.awayScore ?? game.awayScore ?? '0')

      for (const contract of matchingContracts) {
        try {
          const multiContract = contract as CPMMMultiContract
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
            })
          }
          else if (awayScore > homeScore) {
            const awayAnswer = answers[1]
            if (!awayAnswer) {
              log(`Contract ${contract.id}: Missing away answer. Skipping.`)
              continue
            }
            log(`Resolving contract ${contract.id} (Away win).`)
            await resolveMarketHelper(multiContract, resolver, resolver, {
              outcome: 'CHOOSE_ONE',
              answerId: awayAnswer.id,
            })
          }
          else {
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
