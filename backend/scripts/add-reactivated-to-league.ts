import { groupBy, mapValues } from 'lodash'
import { runScript } from 'run-script'
import { addToLeagueIfNotInOne, getUsersNotInLeague } from 'shared/leagues'

if (require.main === module) {
  runScript(async ({ pg }) => {
    const userIds = await getUsersNotInLeague(pg, 1)
    console.log('userIds', userIds)
    const divisions = []
    for (const userId of userIds) {
      divisions.push((await addToLeagueIfNotInOne(pg, userId)).division)
      console.log(
        'Added user',
        userId,
        'to league',
        divisions[divisions.length - 1]
      )
    }
    console.log(
      mapValues(
        groupBy(divisions, (d) => d),
        (d) => d.length
      )
    )
  })
}
