import { runScript } from './run-script'
runScript(async ({ pg }) => {
  const u = await pg.oneOrNone('select id, username, name from users where lower(username) = $1 limit 1', ['teststef'])
  console.log(u ? JSON.stringify(u) : 'NOT FOUND in users table')
})
