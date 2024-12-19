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
            '2hGlgVhIyvVaFyQAREPi', // sports_default
            '307ecfd7-be33-485c-884b-75c61d1f51d4', // premier-league-20242025
            '5gsW3dPR3ySBRZCodrgm', // premiere-league
            'ypd6vR44ZzJyN9xykx6e', // soccer
          ]
        : sportsGames.strLeague === 'NBA'
        ? [
            '2hGlgVhIyvVaFyQAREPi', // sports_default
            'i0v3cXwuxmO9fpcInVYb', // nba
            '0ac78428-c1bc-4549-aa30-416fa1df36e2', // nba-20242025-season
            'NjkFkdkvRvBHoeMDQ5NB', //basketball
          ]
        : sportsGames.strLeague === 'NFL'
        ? [
            '2hGlgVhIyvVaFyQAREPi', // sports_default
            'TNQwmbE5p6dnKx2e6Qlp', // nfl
            'Vcf6CYTTSXAiStbKSqQq', // football
          ]
        : [
            '2hGlgVhIyvVaFyQAREPi', // sports_default
            'lccgApXa1l7O5ZH3XfhH', // nhl
            'tYP9jmPPjoX29KfzE4l5', // hockey
          ]

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
