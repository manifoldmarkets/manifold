import { runScript } from './run-script'

// Script to count how many users have completed Predictle today
// Run with: npx ts-node count-predictle-events.ts [dev|prod]

runScript(async ({ pg }) => {
  // Get today's date string in Pacific Time (YYYY-MM-DD)
  const todayPTString = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Los_Angeles',
  })

  console.log('Today (PT):', todayPTString)

  // Query user_events for 'predictle completed' events from today
  // Use timezone conversion in PostgreSQL to get start of day in Pacific Time
  const result = await pg.one<{ count: number }>(
    `
    SELECT COUNT(DISTINCT user_id) as count
    FROM user_events
    WHERE name = 'predictle completed'
      AND ts >= (TIMESTAMP '${todayPTString} 00:00:00') AT TIME ZONE 'America/Los_Angeles'
      AND user_id IS NOT NULL
    `,
    []
  )

  // Get distinct anonymous users (using deviceId from data jsonb)
  const anonResult = await pg.one<{ count: number }>(
    `
    SELECT COUNT(DISTINCT data->>'deviceId') as count
    FROM user_events
    WHERE name = 'predictle completed'
      AND ts >= (TIMESTAMP '${todayPTString} 00:00:00') AT TIME ZONE 'America/Los_Angeles'
      AND user_id IS NULL
      AND data->>'deviceId' IS NOT NULL
    `,
    []
  )

  // Also get total event count for reference
  const totalResult = await pg.one<{ count: number }>(
    `
    SELECT COUNT(*) as count
    FROM user_events
    WHERE name = 'predictle completed'
      AND ts >= (TIMESTAMP '${todayPTString} 00:00:00') AT TIME ZONE 'America/Los_Angeles'
    `,
    []
  )

  console.log('\n=== Predictle Completions Today ===')
  console.log(`Logged-in users: ${result.count}`)
  console.log(`Anonymous users: ${anonResult.count}`)
  console.log(`Total events: ${totalResult.count}`)
})
