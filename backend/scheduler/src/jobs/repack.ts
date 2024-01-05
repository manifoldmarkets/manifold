import { spawn } from 'child_process'
import { getInstanceHostname } from 'common/supabase/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { JobContext, isProd } from 'shared/utils'
import { PROD_CONFIG } from 'common/envs/prod'
import { DEV_CONFIG } from 'common/envs/dev'

type RepackAuth = { host: string; username: string }

function getDbHost() {
  const instanceId = isProd()
    ? PROD_CONFIG.supabaseInstanceId
    : DEV_CONFIG.supabaseInstanceId
  return `db.${getInstanceHostname(instanceId)}`
}

// function execRepackAll(ctx: JobContext, auth: RepackAuth) {
//   const { host, username } = auth
//   const args = ['-h', host, '-d', username, '-c', 'public', '-k']
//   return spawnRepack(ctx, args)
// }

function execRepackOne(ctx: JobContext, auth: RepackAuth, tableName: string) {
  const { host, username } = auth
  const args = ['-h', host, '-d', username, '-t', tableName, '-k']
  return spawnRepack(ctx, args)
}

function execReindex(ctx: JobContext, auth: RepackAuth, tableName: string) {
  const { host, username } = auth
  const args = ['-h', host, '-d', username, '-t', tableName, '-k', '-x']
  return spawnRepack(ctx, args)
}

function spawnRepack({ log }: JobContext, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn('/usr/libexec/postgresql15/pg_repack', args, {
      env: {
        PGUSER: 'postgres',
        PGPASSWORD: process.env.SUPABASE_PASSWORD,
        PGOPTIONS:
          // make sure that the TCP connection doesn't drop on long repack operations
          '-c tcp_keepalives_idle=60 -c tcp_keepalives_interval=5 -c tcp_keepalives_count=4',
      },
    })
    proc.stdout.on('data', (data) => log(`[repack stdout] ${data}`))
    proc.stderr.on('data', (data) => log(`[repack stderr] ${data}`))
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`pg_repack exited with code ${code}.`))
      }
    })
  })
}

export async function reindexAll(ctx: JobContext) {
  const { log } = ctx
  const pg = createSupabaseDirectClient()
  const tableNames = await pg.map(
    "select tablename from pg_tables where schemaname = 'public'",
    [],
    (r) => r.tablename
  )
  const auth = { host: getDbHost(), username: 'postgres' }
  for (const tableName of tableNames) {
    log(`Beginning reindex of ${tableName}...`)
    await execReindex(ctx, auth, tableName)
    log(`Finished reindexing ${tableName}.`)
  }
}

export function createRepackTableJob(tableName: string) {
  return async (ctx: JobContext) => {
    const auth = { host: getDbHost(), username: 'postgres' }
    await execRepackOne(ctx, auth, tableName)
  }
}
