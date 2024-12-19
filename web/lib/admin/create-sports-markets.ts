import { api } from 'web/lib/api/api'
import { SportsGames } from 'common/sports-info'

interface MarketCreationProps {
  question: string
  descriptionMarkdown: string | undefined
  outcomeType: 'MULTIPLE_CHOICE'
  closeTime: number
  answers: string[]
  visibility: 'public' | 'unlisted' | undefined
  addAnswersMode: 'DISABLED' | 'ONLY_CREATOR' | 'ANYONE'
  shouldAnswersSumToOne: boolean
  sportsStartTimestamp: string
  sportsEventId: string
  sportsLeague: string
  groupIds: string[]
}

export const handleCreateSportsMarkets = async (
  setIsLoading: (loading: boolean) => void,
  setIsFinished: (finished: boolean) => void
) => {
  setIsLoading(true)
  setIsFinished(false)
  try {
    console.log('Fetching sportsGames...')
    const data = await api('get-sports-games', {})
    const sportsGames = (data.schedule || []) as SportsGames[]
    const sportsGamesToProcess = sportsGames

    const createdMarkets: {
      id: string
      isEPL: boolean
      isNBA: boolean
      isNFL: boolean
      isNHL: boolean
    }[] = []

    for (const sportsGames of sportsGamesToProcess) {
      const closeTime =
        new Date(sportsGames.strTimestamp).getTime() + 2.5 * 60 * 60 * 1000

      const isEPL = sportsGames.strLeague === 'English Premier League'
      const isNBA = sportsGames.strLeague === 'NBA'
      const isNFL = sportsGames.strLeague === 'NFL'
      const isNHL = sportsGames.strLeague === 'NHL'
      const answers = isEPL
        ? [sportsGames.strHomeTeam, sportsGames.strAwayTeam, 'Draw']
        : [sportsGames.strHomeTeam, sportsGames.strAwayTeam]

      const groupIds = isEPL
        ? [
            // '2hGlgVhIyvVaFyQAREPi',
            // '307ecfd7-be33-485c-884b-75c61d1f51d4',
            // '5gsW3dPR3ySBRZCodrgm',
            // 'ypd6vR44ZzJyN9xykx6e',
            '2ea265a7-a361-4d2a-ac3b-3bd0ad034a89', //dev soccer group for testing
          ]
        : sportsGames.strLeague === 'NBA'
        ? [
            'e6a9a59f-3f64-4e06-a013-8d0706e2493e', //dev basketball group for testing
            'IOffGO7C9c0dfDura9Yn', //dev sports for testing
          ]
        : sportsGames.strLeague === 'NFL'
        ? [
            'fb91863a-6c25-4da0-a558-fd0a83ed5eee', //dev football for testing
            'IOffGO7C9c0dfDura9Yn', //dev sports for testing
          ]
        : ['1cf23469-685c-4c81-b22c-c59b68dcdbdc'] //dev ice hockey for testing

      const eplDescription = `Resolves to the winning team or draw. The match between ${sportsGames.strHomeTeam} (home) and ${sportsGames.strAwayTeam} (away) is scheduled for ${sportsGames.dateEvent} at ${sportsGames.strTime} GMT. If the match is delayed, the market will be extended. If the match is permanently cancelled or an unexpected event occurs preventing a clear outcome, this market may be resolved to 33%-33%-33% between the 3 answers.`

      const noTieDescription = `Resolves to the winning team. The game between ${sportsGames.strHomeTeam} (home) and ${sportsGames.strAwayTeam} (away) is scheduled for ${sportsGames.dateEvent} at ${sportsGames.strTime} GMT. If the game is delayed, the market will be extended. If the game is cancelled, tied, or unexpected circumstances prevent a clear winner, this market may be resolved to 50%-50%.`

      const description = isEPL ? eplDescription : noTieDescription
      const createProps: MarketCreationProps = {
        question: `${sportsGames.strHomeTeam} vs ${sportsGames.strAwayTeam} (${sportsGames.strLeague})`,
        descriptionMarkdown: description,
        outcomeType: 'MULTIPLE_CHOICE' as const,
        closeTime,
        answers,
        visibility: 'public',
        addAnswersMode: 'DISABLED',
        shouldAnswersSumToOne: true,
        sportsStartTimestamp: sportsGames.strTimestamp,
        sportsEventId: sportsGames.idEvent,
        sportsLeague: sportsGames.strLeague,
        groupIds,
      }

      const result = await api('market', createProps)

      createdMarkets.push({
        id: result.id,
        isEPL,
        isNBA,
        isNFL,
        isNHL,
      })
    }

    for (const { id: marketId, isEPL, isNBA, isNFL, isNHL } of createdMarkets) {
      if (isNHL) continue

      let subsidyAmount = 50
      if (isEPL) subsidyAmount = 25

      await api('create-cash-contract', {
        manaContractId: marketId,
        subsidyAmount,
      })
    }

    setIsFinished(true)
  } catch (error) {
    console.error('Error creating sports markets:', error)
  } finally {
    setIsLoading(false)
  }
}
