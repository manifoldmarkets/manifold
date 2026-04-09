import { readFile } from 'fs/promises'
import { resolve } from 'path'
import { runScript } from 'run-script'

runScript(async ({ pg }) => {
  const sqlPath = resolve(__dirname, '../supabase/signup_blocklist.sql')
  const sql = await readFile(sqlPath, 'utf8')

  await pg.none(sql)
  console.log('Initialized signup_blocklist table.')
})
