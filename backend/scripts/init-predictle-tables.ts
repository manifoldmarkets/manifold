import { runScript } from 'run-script'

// One-time script to initialize Predictle tables
// Run with: npx ts-node init-predictle-tables.ts [dev|prod]

runScript(async ({ pg }) => {
  console.log('Creating predictle_daily table...')
  await pg.none(`
    CREATE TABLE IF NOT EXISTS predictle_daily (
      date_pt TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_time TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  console.log('Creating predictle_results table...')
  await pg.none(`
    CREATE TABLE IF NOT EXISTS predictle_results (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      puzzle_number INT NOT NULL,
      attempts INT NOT NULL,
      won BOOLEAN NOT NULL,
      created_time TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, puzzle_number)
    )
  `)

  console.log('Creating indexes...')
  await pg.none(`
    CREATE INDEX IF NOT EXISTS idx_predictle_results_user_id 
    ON predictle_results(user_id)
  `)
  await pg.none(`
    CREATE INDEX IF NOT EXISTS idx_predictle_results_puzzle_number 
    ON predictle_results(puzzle_number)
  `)

  console.log('Predictle tables initialized successfully!')
})
