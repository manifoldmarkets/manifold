import { runScript } from 'run-script'

// Get today's date in Pacific Time (same as the backend uses)
function getTodayDateString(): string {
  const now = new Date()
  const pacificDate = now.toLocaleDateString('en-CA', {
    timeZone: 'America/Los_Angeles',
  })
  return pacificDate // Returns YYYY-MM-DD format
}

runScript(async ({ pg }) => {
  const todayDate = getTodayDateString()

  console.log(`Deleting predictle for date: ${todayDate}`)

  const result = await pg.result(
    `DELETE FROM predictle_daily WHERE date_pt = $1`,
    [todayDate]
  )

  console.log(`Deleted ${result.rowCount} row(s)`)
})
