const fs = require('node:fs')
const path = require('node:path')
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager')
const { Client } = require('../backend/api/node_modules/pg')
;(async () => {
  const credentials = JSON.parse(
    fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS_DEV, 'utf8')
  )
  if (credentials.project_id !== 'dev-mantic-markets')
    throw new Error('DEV credentials required')
  const secrets = new SecretManagerServiceClient({
    credentials,
    projectId: credentials.project_id,
  })
  const password =
    process.env.YAP_DEV_DB_PASSWORD ||
    (
      await secrets.accessSecretVersion(
        {
          name: 'projects/dev-mantic-markets/secrets/SUPABASE_PASSWORD/versions/latest',
        },
        { timeout: 15000 }
      )
    )[0].payload.data.toString()
  const db = new Client({
    host: 'db.mfodonznyfxllcezufgr.supabase.co',
    port: 5432,
    user: 'postgres',
    database: 'postgres',
    password,
    connectionTimeoutMillis: 10000,
  })
  try {
    await db.connect()
    const {
      rows: [state],
    } = await db.query(`select
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='social_posts' and column_name='market_comment_id') as paired,
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='social_posts' and column_name='canonical_key') and to_regclass('public.social_reposts') is not null and to_regclass('public.social_thread_subscriptions') is not null as discussions`)
    if (
      process.argv.includes('--apply-migration') &&
      (!state.paired || !state.discussions)
    ) {
      await db.query('begin')
      await db.query("set local lock_timeout = '5s'")
      await db.query("set local statement_timeout = '30s'")
      for (const migration of [
        ...(!state.paired ? ['2026103002_social_post_market_comment.sql'] : []),
        ...(!state.discussions ? ['2026111201_social_discussions.sql'] : []),
      ]) {
        await db.query(
          fs.readFileSync(
            path.join(__dirname, '../backend/supabase/migrations', migration),
            'utf8'
          )
        )
      }
      await db.query('commit')
      console.log('Applied Yap additive migrations to DEV')
    } else {
      console.log(
        state.paired && state.discussions
          ? 'Yap shared-discussion schema ready'
          : 'Yap migration required'
      )
      if (!state.paired || !state.discussions) process.exitCode = 1
    }
  } finally {
    await db.end()
    await secrets.close()
  }
})().catch((e) => {
  console.error(e.message)
  process.exitCode = 1
})
