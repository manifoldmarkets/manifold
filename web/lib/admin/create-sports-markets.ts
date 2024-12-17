import { api } from 'web/lib/api/api'
import { Fixture } from 'common/sports-info'

export const handleCreateSportsMarkets = async (
  setIsLoading: (loading: boolean) => void,
  setIsFinished: (finished: boolean) => void
) => {
  setIsLoading(true)
  setIsFinished(false)
  try {
    console.log('Fetching sports fixtures...')
    const data = await api('get-sports-fixtures', {})
    const fixtures = (data.schedule || []) as Fixture[]
    const fixturesToProcess = fixtures

    const createdMarkets: {
      id: string
      isEPL: boolean
      isNBA: boolean
      isNFL: boolean
    }[] = []

    for (const fixture of fixturesToProcess) {
      const closeTime =
        new Date(fixture.strTimestamp).getTime() + 2.5 * 60 * 60 * 1000

      const isEPL = fixture.strLeague === 'English Premier League'
      const isNBA = fixture.strLeague === 'NBA'
      const isNFL = fixture.strLeague === 'NFL'
      const answers = isEPL
        ? [fixture.strHomeTeam, fixture.strAwayTeam, 'Draw']
        : [fixture.strHomeTeam, fixture.strAwayTeam]

      const groupIds = isEPL
        ? [
            // '2hGlgVhIyvVaFyQAREPi',
            // '307ecfd7-be33-485c-884b-75c61d1f51d4',
            // '5gsW3dPR3ySBRZCodrgm',
            // 'ypd6vR44ZzJyN9xykx6e',
            '2ea265a7-a361-4d2a-ac3b-3bd0ad034a89', //dev soccer group for testing
          ]
        : fixture.strLeague === 'NBA'
        ? [
            'e6a9a59f-3f64-4e06-a013-8d0706e2493e', //dev basketball group for testing
            'IOffGO7C9c0dfDura9Yn', //dev sports for testing
          ]
        : [
            'fb91863a-6c25-4da0-a558-fd0a83ed5eee', //dev football for testing
            'IOffGO7C9c0dfDura9Yn', //dev sports for testing
          ]

      const eplDescription = `Resolves to the winning team or draw. The match between ${fixture.strHomeTeam} (home) and ${fixture.strAwayTeam} (away) is scheduled for ${fixture.dateEvent} at ${fixture.strTime} GMT. If the match is delayed, the market will be extended. If the match is permanently cancelled or an unexpected event occurs preventing a clear outcome, this market may be resolved to 33%-33%-33% between the 3 answers.`

      const nbaNflDescription = `Resolves to the winning team. The game between ${fixture.strHomeTeam} (home) and ${fixture.strAwayTeam} (away) is scheduled for ${fixture.dateEvent} at ${fixture.strTime} GMT. If the game is delayed, the market will be extended. If the game is cancelled, tied, or unexpected circumstances prevent a clear winner, this market may be resolved to 50%-50%.`

      const description = isEPL ? eplDescription : nbaNflDescription
      const createProps = {
        question: `${fixture.strHomeTeam} vs ${fixture.strAwayTeam} (${fixture.strLeague})`,
        descriptionMarkdown: description,
        outcomeType: 'MULTIPLE_CHOICE',
        closeTime,
        answers,
        visibility: 'public',
        addAnswersMode: 'DISABLED',
        shouldAnswersSumToOne: true,
        sportsStartTimestamp: fixture.strTimestamp,
        sportsEventId: fixture.idEvent,
        sportsLeague: fixture.strLeague,
        groupIds,
      }

      const result = await api('market', createProps as any)

      createdMarkets.push({
        id: result.id,
        isEPL,
        isNBA,
        isNFL,
      })
    }

    for (const { id: marketId, isEPL } of createdMarkets) {
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
