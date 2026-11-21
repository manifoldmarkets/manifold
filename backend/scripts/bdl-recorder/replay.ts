import { createBdlClient } from 'shared/balldontlie-client'

// From backend/scripts, set LOCAL_ONLY=true, BDL_FIXTURE_DIR to the recording
// or fixture root, and optionally SPORTS_FAKE_NOW to a scenario's ISO time.
// npx ts-node bdl-recorder/replay.ts /nba/v1/games 'game_ids[]=42&per_page=1'
async function main(args: string[]) {
  if (process.env.LOCAL_ONLY !== 'true' || !process.env.BDL_FIXTURE_DIR)
    throw new Error('Replay requires LOCAL_ONLY=true and BDL_FIXTURE_DIR.')
  const [path, query] = args
  if (!path || args.length > 2)
    throw new Error('Usage: replay.ts <sports API path> [query string]')
  const search = new URLSearchParams(query)
  const params = Object.fromEntries(
    Array.from(new Set(search.keys()), (name) => {
      const values = search.getAll(name)
      return [name, values.length === 1 ? values[0] : values]
    })
  )
  const client = createBdlClient({
    maxAttempts: 1,
    onAttempt: (page) => console.log(JSON.stringify(page, null, 2)),
  })
  await client.get(path, params)
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'Fixture replay failed'
    )
    process.exitCode = 1
  })
}
