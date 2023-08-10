import { runScript } from '../run-script'
import { generateLeagueChats } from 'shared/generate-league-chats'

if (require.main === module) {
  runScript(async ({ pg, db }) => {
    const season = 4
    await generateLeagueChats(season, pg, db)
  })
}
