import { runScript } from './run-script'

runScript(async ({ pg }) => {
  const g = await pg.oneOrNone(
    `select id, slug, privacy_status from groups where slug = $1 limit 1`,
    ['ms-official-wc2026']
  )
  console.log(g ? JSON.stringify(g) : 'Group NOT FOUND in dev DB')
})
