import { runScript } from './run-script'

// One-off script to add game_state column to predictle_results table
// Run with: npx ts-node add-predictle-game-state-column.ts [dev|prod]

runScript(async ({ pg }) => {
  console.log('Adding game_state column to predictle_results table...')

  await pg.none(`
    ALTER TABLE predictle_results
    ADD COLUMN IF NOT EXISTS game_state JSONB
  `)

  console.log('Done! game_state column added.')
})
