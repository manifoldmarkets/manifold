import * as fs from 'fs/promises'
import { execSync } from 'child_process'
import { type SupabaseDirectClient } from 'shared/supabase/init'
import { runScript } from 'run-script'
import { countBy } from 'lodash'

const outputDir = `../supabase/`

runScript(async ({ pg }) => {
  // make the output directory if it doesn't exist
  execSync(`mkdir -p ${outputDir}`)
  // delete all sql files except seed.sql
  execSync(`cd ${outputDir} && find *.sql -type f ! -name seed.sql -delete`)
  await generateSQLFiles(pg)
})

async function getTableInfo(pg: SupabaseDirectClient, tableName: string) {
  const columns = await pg.manyOrNone<{
    name: string
    type: string
    not_null: boolean
    default: string | null
    identity: boolean
    always: 'BY DEFAULT' | 'ALWAYS'
    gen: string | null
    stored: 'STORED' | 'VIRTUAL'
  }>(
    `SELECT
      column_name as name,
      format_type(a.atttypid, a.atttypmod) as type,
      is_nullable = 'NO' as not_null,
      column_default as default,
      is_identity = 'YES' as identity,
      identity_generation as always,
      pg_get_expr(d.adbin, d.adrelid, true) AS gen,
      CASE
        WHEN a.attgenerated = 's' THEN 'STORED'
        WHEN a.attgenerated = 'v' THEN 'VIRTUAL'
        ELSE NULL
      END AS stored
    FROM information_schema.columns c
    LEFT JOIN pg_catalog.pg_attribute a
      ON a.attrelid = c.table_name::regclass
      AND a.attname = c.column_name
      AND NOT a.attisdropped
    JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
    LEFT JOIN pg_catalog.pg_attrdef d
      ON d.adrelid = a.attrelid
      AND d.adnum = a.attnum
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY column_name`,
    [tableName]
  )

  const checks = await pg.manyOrNone<{
    name: string
    definition: string
  }>(
    `SELECT
      cc.constraint_name as name,
      cc.check_clause as definition
    FROM information_schema.table_constraints tc
    join information_schema.check_constraints cc
      ON tc.constraint_schema = cc.constraint_schema
      AND tc.constraint_name = cc.constraint_name
    WHERE tc.constraint_type = 'CHECK'
    AND NOT cc.check_clause ilike '% IS NOT NULL'
    AND tc.table_schema = 'public'
    AND tc.table_name = $1`,
    [tableName]
  )

  const primaryKeys = await pg.map(
    `SELECT c.column_name
    FROM
      information_schema.table_constraints tc
    JOIN
      information_schema.constraint_column_usage AS ccu
      USING (constraint_schema, constraint_name)
    JOIN information_schema.columns AS c
      ON c.table_schema = tc.constraint_schema
      AND tc.table_name = c.table_name
      AND ccu.column_name = c.column_name
    WHERE constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public' AND tc.table_name = $1`,
    [tableName],
    (row) => row.column_name as string
  )

  const foreignKeys = await pg.manyOrNone<{
    constraint_name: string
    definition: string
  }>(
    `SELECT
      conname AS constraint_name,
      pg_get_constraintdef(c.oid) AS definition
    FROM
      pg_constraint c
    JOIN
      pg_namespace n ON n.oid = c.connamespace
    WHERE
      contype = 'f'
      AND conrelid = $1::regclass`,
    [tableName]
  )

  const triggers = await pg.manyOrNone<{
    trigger_name: string
    definition: string
  }>(
    `SELECT
      tgname AS trigger_name,
      pg_get_triggerdef(t.oid) AS definition
    FROM
      pg_trigger t
    WHERE
      tgrelid = $1::regclass
      AND NOT tgisinternal`,
    [tableName]
  )
  const rlsEnabled = await pg.one(
    `SELECT relrowsecurity
    FROM pg_class
    WHERE oid = $1::regclass`,
    [tableName]
  )
  const rls = !!rlsEnabled.relrowsecurity

  const policies = await pg.any(
    `SELECT
      polname AS policy_name,
      pg_get_expr(polqual, polrelid) AS expression,
      pg_get_expr(polwithcheck, polrelid) AS with_check,
      (select r.rolname from unnest(polroles) u join pg_roles r on r.oid = u.u) AS role,
      CASE
        WHEN polcmd = '*' THEN 'ALL'
        WHEN polcmd = 'r' THEN 'SELECT'
        WHEN polcmd = 'a' THEN 'INSERT'
        WHEN polcmd = 'w' THEN 'UPDATE'
        WHEN polcmd = 'd' THEN 'DELETE'
        ELSE polcmd::text
      END AS command
    FROM
      pg_policy
    WHERE
      polrelid = $1::regclass`,
    [tableName]
  )

  const indexes = await pg.manyOrNone<{
    index_name: string
    definition: string
  }>(
    `SELECT
      indexname AS index_name,
      indexdef AS definition
    FROM
      pg_indexes
    WHERE
      schemaname = 'public'
      AND tablename = $1
    ORDER BY
      indexname`,
    [tableName]
  )

  return {
    tableName,
    columns,
    checks,
    primaryKeys,
    foreignKeys,
    triggers,
    rls,
    policies,
    indexes,
  }
}

async function getFunctions(pg: SupabaseDirectClient) {
  console.log('Getting functions')
  const rows = await pg.many<{
    function_name: string
    definition: string
  }>(
    `SELECT
      proname AS function_name,
      pg_get_functiondef(oid) AS definition
    FROM pg_proc
    WHERE
      pronamespace = 'public'::regnamespace
      and prokind = 'f'
    ORDER BY proname asc, pronargs asc, oid desc`
  )
  return rows.filter((f) => !f.definition.includes(`'$libdir/`))
}

async function getViews(pg: SupabaseDirectClient) {
  console.log('Getting views')
  return pg.many<{ view_name: string; definition: string }>(
    `SELECT
      table_name AS view_name,
      view_definition AS definition
    FROM information_schema.views
      where table_schema = 'public'
    ORDER BY table_name asc`
  )
}

async function generateSQLFiles(pg: SupabaseDirectClient) {
  const tables = await pg.map(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    [],
    (row) => row.tablename as string
  )

  console.log(`Getting info for ${tables.length} tables`)
  const tableInfos = await Promise.all(
    tables.map((table) => getTableInfo(pg, table))
  )
  const functions = await getFunctions(pg)
  const views = await getViews(pg)

  for (const tableInfo of tableInfos) {
    let content = `-- This file is autogenerated from regen-schema.ts\n\n`

    content += `CREATE TABLE IF NOT EXISTS ${tableInfo.tableName} (\n`

    // organize check constraints by column
    const checksByColumn: {
      [col: string]: { name: string; definition: string }
    } = {}
    const remainingChecks = []
    for (const check of tableInfo.checks) {
      const matches = tableInfo.columns.filter((c) =>
        check.definition.includes(c.name)
      )

      if (matches.length === 1) {
        checksByColumn[matches[0].name] = check
      } else {
        remainingChecks.push(check)
      }
    }

    const pkeys = tableInfo.primaryKeys

    for (const c of tableInfo.columns) {
      const isSerial = c.default?.startsWith('nextval(')

      if (isSerial) {
        content += `  ${c.name} ${c.type === 'bigint' ? 'bigserial' : 'serial'}`
      } else {
        content += `  ${c.name} ${c.type}`
        if (pkeys.length === 1 && pkeys[0] === c.name) content += ' PRIMARY KEY'
        if (c.default) content += ` DEFAULT ${c.default}`
        else if (c.identity) content += ` GENERATED ${c.always} AS IDENTITY`
        else if (c.gen) content += ` GENERATED ALWAYS AS (${c.gen}) ${c.stored}`
      }
      if (c.not_null) content += ' NOT NULL'
      const check = checksByColumn[c.name]
      if (check)
        content += ` CONSTRAINT ${check.name} CHECK ${check.definition}`

      content += ',\n'
    }

    if (pkeys.length > 1) {
      content += `  CONSTRAINT PRIMARY KEY (${pkeys.join(', ')}),\n`
    }

    for (const check of remainingChecks) {
      content += `  CONSTRAINT ${check.name} CHECK ${check.definition},\n`
    }

    // remove the trailing comma
    content = content.replace(/,(?=[^,]+$)/, '')
    content += ');\n\n'

    if (tableInfo.foreignKeys.length > 0) content += `-- Foreign Keys\n`
    for (const fk of tableInfo.foreignKeys) {
      content += `ALTER TABLE ${tableInfo.tableName} ADD CONSTRAINT ${fk.constraint_name} ${fk.definition};\n`
    }
    content += '\n'

    const tableFunctions = []

    if (tableInfo.triggers.length > 0) content += `-- Triggers\n`
    for (const trigger of tableInfo.triggers) {
      content += `${trigger.definition};\n`

      const funcName = trigger.definition.match(/execute function (\w+)/i)?.[1]
      if (funcName) tableFunctions.push(funcName)
    }
    content += '\n'

    if (tableFunctions.length > 0) content += `-- Functions\n`
    for (const func of tableFunctions) {
      const i = functions.findIndex((f) => f.function_name === func)
      if (i >= 0) {
        content += `${functions[i].definition};\n\n`
        functions.splice(i, 1) // remove from list so we don't duplicate
      }
    }
    if (tableInfo.rls) {
      content += `-- Row Level Security\n`
      content += `ALTER TABLE ${tableInfo.tableName} ENABLE ROW LEVEL SECURITY;\n`
    }

    if (tableInfo.policies.length > 0) {
      content += `-- Policies\n`
    }
    for (const policy of tableInfo.policies) {
      content += `DROP POLICY IF EXISTS "${policy.policy_name}" ON ${tableInfo.tableName};\n`
      content += `CREATE POLICY "${policy.policy_name}" ON ${tableInfo.tableName} `
      if (policy.command) content += `FOR ${policy.command} `
      if (policy.role) content += `TO ${policy.role} `
      if (policy.expression) content += `USING (${policy.expression}) `
      if (policy.with_check) content += `WITH CHECK (${policy.with_check})`
      content += ';\n\n'
    }

    if (tableInfo.indexes.length > 0) content += `-- Indexes\n`
    for (const index of tableInfo.indexes) {
      content += `DROP INDEX IF EXISTS ${index.index_name};\n`
      content += `${index.definition};\n`
    }
    content += '\n'

    await fs.writeFile(`${outputDir}/${tableInfo.tableName}.sql`, content)
  }

  console.log('Writing remaining functions to functions.sql')
  let functionsContent = `-- This file is autogenerated from regen-schema.ts\n\n`

  for (const func of functions) {
    functionsContent += `${func.definition};\n\n`
  }

  await fs.writeFile(`${outputDir}/functions.sql`, functionsContent)

  console.log('Writing views to views.sql')
  let viewsContent = `-- This file is autogenerated from regen-schema.ts\n\n`

  for (const view of views) {
    viewsContent += `CREATE OR REPLACE VIEW ${view.view_name} AS\n`
    viewsContent += `${view.definition}\n\n`
  }

  await fs.writeFile(`${outputDir}/views.sql`, viewsContent)

  console.log('Prettifying SQL files...')
  execSync(
    `prettier --write ${outputDir}/*.sql --ignore-path ../supabase/.gitignore`
  )
}
