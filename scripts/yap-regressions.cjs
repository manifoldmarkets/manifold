// Runs actual Yap SQL/handlers against temporary tables on DEV. Always rolls back.
// Set YAP_REGRESSION_DATABASE_URL to use another Postgres instead of DEV, such
// as a local one loaded from backend/supabase (it needs millis_to_ts).
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const ts = require('../node_modules/typescript')
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager')
const { Client } = require('../backend/api/node_modules/pg')
function loadDeclarations(file, names, bindings) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(path.join(__dirname, '..', file), 'utf8'),
    ts.ScriptTarget.Latest,
    true
  )
  const declarations = source.statements.filter(
    (n) =>
      (ts.isVariableStatement(n) &&
        n.declarationList.declarations.some((d) =>
          names.includes(d.name.getText(source))
        )) ||
      (ts.isFunctionDeclaration(n) && names.includes(n.name?.text))
  )
  assert.equal(declarations.length, names.length)
  const js = ts.transpileModule(
    declarations.map((n) => n.getText(source)).join('\n') +
      '\nObject.assign(exports,{' +
      names.join(',') +
      '});',
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }
  ).outputText
  const out = {}
  new Function('exports', ...Object.keys(bindings), js)(
    out,
    ...Object.values(bindings)
  )
  return out
}
;(async () => {
  const databaseUrl = process.env.YAP_REGRESSION_DATABASE_URL
  let secrets
  let db
  try {
    if (databaseUrl) {
      db = new Client({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 10000,
      })
    } else {
      const credentials = JSON.parse(
        fs.readFileSync(
          process.env.YAP_DEV_CREDENTIALS ||
            'C:/Projects/secretmanifoldkey/dev-mantic-markets-firebase-adminsdk.json',
          'utf8'
        )
      )
      assert.equal(credentials.project_id, 'dev-mantic-markets')
      secrets = new SecretManagerServiceClient({
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
      db = new Client({
        host: 'db.mfodonznyfxllcezufgr.supabase.co',
        port: 5432,
        user: 'postgres',
        database: 'postgres',
        password,
        connectionTimeoutMillis: 10000,
      })
    }
    await db.connect()
    await db.query(`begin; set local statement_timeout='15s'; set local search_path=pg_temp,public;
   create temporary table users(id text primary key,is_bot boolean default false);
   create temporary table contracts(id text primary key,creator_id text,created_time timestamptz default now(),visibility text default 'public',data jsonb default '{}');
   create temporary table contract_comments(comment_id text primary key,contract_id text,user_id text,created_time timestamptz default now(),data jsonb default '{}',likes int default 0,dislikes int default 0);
   create temporary table contract_bets(bet_id text primary key,contract_id text,user_id text,created_time timestamptz default now());
   create temporary table social_posts(id text primary key,user_id text,text text default '',rich_content jsonb,image_urls text[] default '{}',parent_id text,root_id text,market_comment_id text,source_contract_id text,source_bet_id text,created_time timestamptz default now(),deleted_time timestamptz);
   create temporary table social_post_markets(post_id text,contract_id text,position int default 0,primary key(post_id,contract_id));
   create temporary table user_contract_interactions(user_id text,contract_id text,name text,comment_id text,bet_id text);
   create temporary table user_reactions(content_id text,content_type text,content_owner_id text,user_id text,reaction_type text,created_time timestamptz default now());
   create temporary table social_reposts(post_id text references social_posts(id),user_id text references users(id),active boolean default true,created_time timestamptz default now(),bumped_time timestamptz default now(),primary key(post_id,user_id));
   create temporary table social_thread_subscriptions(root_id text references social_posts(id),user_id text references users(id),muted boolean default false,created_time timestamptz default now(),primary key(root_id,user_id));
   insert into users(id,is_bot) values('owner',false),('alice',false),('bob',false),('bot',true),('other-owner',false);
   insert into contracts(id,creator_id) values('market','owner'),('other','other-owner');
   insert into social_posts(id,user_id,root_id,market_comment_id) values('original','alice','original','native'),('orphan','alice','orphan','gone');
   insert into social_posts(id,user_id,root_id) values('unlinked','alice','unlinked');
   insert into contract_comments(comment_id,contract_id,user_id,data) values('native','market','alice','{"id":"native","contractId":"market","userId":"alice","content":{"type":"doc"},"createdTime":1700000000000}');
   insert into user_reactions(content_id,content_type,content_owner_id,user_id,reaction_type) values('original','social_post','alice','bob','like'),('native','comment','alice','bob','like'),('original','social_post','alice','owner','like'),
     ('original','social_post','alice','other-owner','dislike'),('orphan','social_post','alice','bob','like'),('unlinked','social_post','alice','bob','like');
  `)
    await db.query(
      fs.readFileSync(
        path.join(
          __dirname,
          '../backend/supabase/migrations/2026111201_social_discussions.sql'
        ),
        'utf8'
      )
    )
    assert.equal(
      (
        await db.query(
          "select likes from contract_comments where comment_id='native'"
        )
      ).rows[0].likes,
      2
    )
    // Likes that moved are gone from the Yap side. Left where they were: a
    // reaction that is not a like, a like whose comment row is missing, and a
    // like on a post that mirrors no comment.
    assert.deepEqual(
      (
        await db.query(
          "select content_id||'/'||user_id||'/'||reaction_type r from user_reactions where content_type='social_post' order by 1"
        )
      ).rows.map((row) => row.r),
      ['original/other-owner/dislike', 'orphan/bob/like', 'unlinked/bob/like']
    )
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from user_reactions where content_type='comment' and content_id='gone'"
        )
      ).rows[0].n,
      0
    )
    // The small adapter executes the application queries unchanged.
    const pg = {
      manyOrNone: async (sql, args) => (await db.query(sql, args)).rows,
      one: async (sql, args, map) => {
        const rows = (await db.query(sql, args)).rows
        assert.equal(rows.length, 1)
        return map ? map(rows[0]) : rows[0]
      },
      oneOrNone: async (sql, args, map) => {
        const rows = (await db.query(sql, args)).rows
        assert.ok(rows.length <= 1)
        return map ? map(rows[0]) : rows[0] ?? null
      },
      none: async (sql, args) => {
        await db.query(sql, args)
      },
      tx: async (fn) => {
        await db.query('savepoint testcase')
        try {
          const r = await fn(pg)
          await db.query('release savepoint testcase')
          return r
        } catch (e) {
          await db.query('rollback to savepoint testcase')
          throw e
        }
      },
    }
    class APIError extends Error {
      constructor(code, message) {
        super(message)
        this.code = code
      }
    }
    const thread = loadDeclarations(
      'backend/shared/src/social-posts.ts',
      [
        'getSocialRow',
        'lockSocialThread',
        'assertSocialInteraction',
        'isSocialThreadOpen',
      ],
      { APIError }
    )
    const skipped = []
    const bridge = loadDeclarations(
      'backend/shared/src/social-discussion.ts',
      [
        'SOCIAL_RECONCILE_BATCH',
        'ensureMarketCommentPost',
        'ensureSocialSource',
        'findSocialSource',
        'subscribeToSocialThread',
        'reconcileMarketDiscussion',
      ],
      {
        ...thread,
        APIError,
        log: { warn: (_message, details) => skipped.push(details.commentId) },
        commentToYapContent: (c) => ({
          text: 'fixture',
          richContent: null,
          imageUrls: [],
        }),
      }
    )
    const sharing = loadDeclarations(
      'backend/api/src/social-sharing.ts',
      ['repostSocialPost', 'setSocialThreadSubscription'],
      {
        ...thread,
        ...bridge,
        APIError,
        onlyUsersWhoCanPerformAction: (_, fn) => fn,
        createSupabaseDirectClient: () => pg,
        socialAuthor: async (id) => ({ id }),
        getSocialViewer: async (id) => ({ id, blocked: [] }),
        limitSocialWrite: async () => {},
        hydrateSocialPosts: async (_, rows) => rows,
      }
    )
    const share = (user = 'bob', remove = false) =>
      sharing.repostSocialPost(
        { source: { postId: 'original' }, remove },
        { uid: user }
      )
    await share()
    const first = (
      await db.query(
        "select bumped_time from social_reposts where post_id='original' and user_id='bob'"
      )
    ).rows[0].bumped_time
    await share()
    await share('bob', true)
    await share()
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from social_reposts where post_id='original' and active"
        )
      ).rows[0].n,
      1
    )
    assert.equal(
      +(
        await db.query(
          "select bumped_time from social_reposts where post_id='original' and user_id='bob'"
        )
      ).rows[0].bumped_time,
      +first
    )
    await db.query(
      "update social_reposts set bumped_time=now()-interval '25 hours' where post_id='original'"
    )
    await share()
    assert.ok(
      +(
        await db.query(
          "select bumped_time from social_reposts where post_id='original' and user_id='bob'"
        )
      ).rows[0].bumped_time >= +first
    )
    await sharing.setSocialThreadSubscription(
      { id: 'original', muted: true },
      { uid: 'alice' }
    )
    await bridge.subscribeToSocialThread(pg, 'original', 'alice')
    assert.equal(
      (
        await db.query(
          "select muted from social_thread_subscriptions where root_id='original' and user_id='alice'"
        )
      ).rows[0].muted,
      true
    )
    await sharing.setSocialThreadSubscription(
      { id: 'original', muted: false },
      { uid: 'alice' }
    )
    assert.equal(
      (
        await db.query(
          "select muted from social_thread_subscriptions where root_id='original' and user_id='alice'"
        )
      ).rows[0].muted,
      false
    )
    // Undoing a share of something that was never put on Yap creates nothing.
    await assert.rejects(
      () =>
        sharing.repostSocialPost(
          { source: { contractId: 'market' }, remove: true },
          { uid: 'bob' }
        ),
      /not re-Yapped/
    )
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from social_posts where canonical_key='market:market'"
        )
      ).rows[0].n,
      0
    )
    const m1 = await bridge.ensureSocialSource(pg, { contractId: 'market' })
    const m2 = await bridge.ensureSocialSource(pg, { contractId: 'market' })
    assert.equal(m1.id, m2.id)
    assert.equal(m1.user_id, 'owner')
    await db.query(`insert into contract_comments(comment_id,contract_id,user_id,data) values
   ('reply','market','bob','{"id":"reply","contractId":"market","userId":"bob","replyToCommentId":"native","content":{"type":"doc"},"createdTime":1700000000001}'),
   ('mod','market','owner','{"id":"mod","userId":"owner","isModComment":true,"content":{"type":"doc"}}');`)
    const r1 = await bridge.ensureMarketCommentPost(pg, 'reply')
    const r2 = await bridge.ensureMarketCommentPost(pg, 'reply')
    assert.equal(r1.id, r2.id)
    assert.equal(r1.parent_id, 'original')
    assert.equal(r1.root_id, 'original')
    assert.equal(r1.feed_visible, false)
    assert.equal(
      (
        await db.query(
          "select data->>'socialPostId' id from contract_comments where comment_id='reply'"
        )
      ).rows[0].id,
      r1.id
    )
    await assert.rejects(
      () => bridge.ensureMarketCommentPost(pg, 'mod'),
      /Mod comments/
    )
    // Reading the market's discussion takes the comments it can place and
    // leaves out a reply under a hidden comment and a reply to a mod comment.
    // A comment whose copy cannot be written (no such user) is skipped alone.
    await db.query(`insert into contract_comments(comment_id,contract_id,user_id,data) values
   ('hidden','market','bob','{"id":"hidden","contractId":"market","userId":"bob","hidden":true,"content":{"type":"doc"},"createdTime":1700000000002}'),
   ('under-hidden','market','alice','{"id":"under-hidden","contractId":"market","userId":"alice","replyToCommentId":"hidden","content":{"type":"doc"},"createdTime":1700000000003}'),
   ('under-mod','market','alice','{"id":"under-mod","contractId":"market","userId":"alice","replyToCommentId":"mod","content":{"type":"doc"},"createdTime":1700000000004}'),
   ('broken','market','nobody','{"id":"broken","contractId":"market","userId":"nobody","content":{"type":"doc"},"createdTime":1700000000005}'),
   ('fresh','market','bob','{"id":"fresh","contractId":"market","userId":"bob","content":{"type":"doc"},"createdTime":1700000000006}');`)
    await bridge.reconcileMarketDiscussion(pg, m1)
    assert.deepEqual(
      (
        await db.query(
          "select market_comment_id id from social_posts where market_comment_id in ('hidden','under-hidden','under-mod','broken','fresh') order by 1"
        )
      ).rows.map((row) => row.id),
      ['fresh']
    )
    assert.deepEqual(skipped, ['broken'])
    assert.equal(
      (await db.query("select parent_id from social_posts where id='mc-fresh'"))
        .rows[0].parent_id,
      m1.id
    )
    await db.query(
      "update social_posts set hidden_time=now() where id='original'"
    )
    await assert.rejects(() => share(), /closed/)
    await db.query(
      "update social_posts set hidden_time=null where id='original'"
    )
    await share('owner')
    await share('bot')
    await db.query(`insert into social_post_markets(post_id,contract_id) values('original','market'),('original','other');
   insert into social_posts(id,user_id,root_id) values('repeated','alice','repeated'),('self','owner','self');
   insert into social_post_markets(post_id,contract_id) values('repeated','market'),('self','market');`)
    const legacy = loadDeclarations(
      'backend/api/src/social-posts.ts',
      ['recordSocialRepost'],
      {}
    )
    await legacy.recordSocialRepost(
      pg,
      'self',
      { contractId: 'market' },
      { id: 'owner' },
      undefined
    )
    assert.equal(
      (await db.query('select count(*)::int n from user_contract_interactions'))
        .rows[0].n,
      0
    )
    await legacy.recordSocialRepost(
      pg,
      'original',
      { contractId: 'market' },
      { id: 'alice' },
      undefined
    )
    assert.equal(
      (await db.query('select count(*)::int n from user_contract_interactions'))
        .rows[0].n,
      1
    )
    const scoring = loadDeclarations(
      'backend/shared/src/importance-score.ts',
      ['getTodayDiscussion'],
      {}
    )
    assert.deepEqual(await scoring.getTodayDiscussion(pg), {
      market: 2,
      other: 3,
    })
    await share('bob', true) // Bob's actual comment still counts once.
    assert.deepEqual(await scoring.getTodayDiscussion(pg), {
      market: 2,
      other: 2,
    })
    console.log(
      'PASS: migration merges likes and leaves what it cannot move; shares are unique and reversible, and an undo creates nothing; 24h cooldown survives undo; mutes survive participation; original authors and native reply roots are preserved; mod comments stay out; comments that cannot be placed are skipped without stopping a read; hidden threads reject interaction; ranking deduplicates people and excludes creators/bots.'
    )
  } finally {
    if (db) {
      await db.query('rollback').catch(() => {})
      await db.end()
    }
    if (secrets) await secrets.close()
  }
})().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
