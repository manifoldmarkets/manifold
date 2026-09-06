// Clones the structure (tables, constraints, indexes, RLS policies) of the
// `public` schema into a brand-new, empty schema for a private Manifold
// instance. Built from the same information_schema/pg_catalog introspection
// queries as backend/scripts/regen-schema.ts, but generates schema-qualified
// DDL executed live against the database instead of writing files.
//
// Deliberately does NOT clone functions, triggers, views, or materialized
// views — those stay defined once in `public` and are resolved for tenant
// schemas via `search_path = <schema>, public` (see supabase/init.ts). A
// SECURITY DEFINER function that pins its own internal search_path to
// `public` will still operate on `public`'s tables even when called from a
// tenant request; if that turns out to matter for a given trigger/function,
// it needs a per-function fix, not a per-clone one.
import { SupabaseDirectClient } from './init'

// Global, cross-tenant tables that must never be duplicated into a tenant
// schema. `instances` is the tenant registry itself.
const EXCLUDED_TABLES = new Set(['instances'])

type ColumnInfo = {
  name: string
  type: string
  not_null: boolean
  default: string | null
  identity: boolean
  always: 'BY DEFAULT' | 'ALWAYS'
  gen: string | null
  stored: 'STORED' | 'VIRTUAL'
}

type TableInfo = {
  tableName: string
  columns: ColumnInfo[]
  checks: { name: string; definition: string }[]
  primaryKeys: string[]
  foreignKeys: { constraint_name: string; definition: string }[]
  rls: boolean
  policies: {
    policy_name: string
    expression: string | null
    with_check: string | null
    role: string | null
    command: string | null
  }[]
  indexes: { index_name: string; definition: string }[]
}

const SCHEMA_NAME_RE = /^instance_[a-z0-9]+$/

async function getPublicTableNames(
  pg: SupabaseDirectClient
): Promise<string[]> {
  const rows = await pg.map(
    `select tablename from pg_tables where schemaname = 'public'`,
    [],
    (row) => row.tablename as string
  )
  return rows.filter((t) => !EXCLUDED_TABLES.has(t))
}

async function getTableInfo(
  pg: SupabaseDirectClient,
  tableName: string
): Promise<TableInfo> {
  const columns = await pg.manyOrNone<ColumnInfo>(
    `select
      column_name as name,
      format_type(a.atttypid, a.atttypmod) as type,
      is_nullable = 'NO' as not_null,
      column_default as default,
      is_identity = 'YES' as identity,
      identity_generation as always,
      pg_get_expr(d.adbin, d.adrelid, true) as gen,
      case
        when a.attgenerated = 's' then 'STORED'
        when a.attgenerated = 'v' then 'VIRTUAL'
        else null
      end as stored
    from information_schema.columns c
    left join pg_catalog.pg_attribute a
      on a.attrelid = c.table_name::regclass
      and a.attname = c.column_name
      and not a.attisdropped
    join pg_catalog.pg_type t on t.oid = a.atttypid
    left join pg_catalog.pg_attrdef d
      on d.adrelid = a.attrelid
      and d.adnum = a.attnum
    where table_schema = 'public' and table_name = $1
    order by column_name`,
    [tableName]
  )

  const checks = await pg.manyOrNone<{ name: string; definition: string }>(
    `select
      cc.constraint_name as name,
      cc.check_clause as definition
    from information_schema.table_constraints tc
    join information_schema.check_constraints cc
      on tc.constraint_schema = cc.constraint_schema
      and tc.constraint_name = cc.constraint_name
    where tc.constraint_type = 'CHECK'
    and not cc.check_clause ilike '% IS NOT NULL'
    and tc.table_schema = 'public'
    and tc.table_name = $1`,
    [tableName]
  )

  const primaryKeys = await pg.map(
    `select c.column_name
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage as ccu
      using (constraint_schema, constraint_name)
    join information_schema.columns as c
      on c.table_schema = tc.constraint_schema
      and tc.table_name = c.table_name
      and ccu.column_name = c.column_name
    where constraint_type = 'PRIMARY KEY' and tc.table_schema = 'public' and tc.table_name = $1`,
    [tableName],
    (row) => row.column_name as string
  )

  const foreignKeys = await pg.manyOrNone<{
    constraint_name: string
    definition: string
  }>(
    `select
      conname as constraint_name,
      pg_get_constraintdef(c.oid) as definition
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
    where contype = 'f' and conrelid = $1::regclass`,
    [tableName]
  )

  const rlsEnabled = await pg.one(
    `select relrowsecurity from pg_class where oid = $1::regclass`,
    [tableName]
  )

  const policies = await pg.any(
    `select
      polname as policy_name,
      pg_get_expr(polqual, polrelid) as expression,
      pg_get_expr(polwithcheck, polrelid) as with_check,
      (select r.rolname from unnest(polroles) u join pg_roles r on r.oid = u.u) as role,
      case
        when polcmd = '*' then 'ALL'
        when polcmd = 'r' then 'SELECT'
        when polcmd = 'a' then 'INSERT'
        when polcmd = 'w' then 'UPDATE'
        when polcmd = 'd' then 'DELETE'
        else polcmd::text
      end as command
    from pg_policy
    where polrelid = $1::regclass`,
    [tableName]
  )

  const indexes = await pg.manyOrNone<{
    index_name: string
    definition: string
  }>(
    `select indexname as index_name, indexdef as definition
    from pg_indexes
    where schemaname = 'public' and tablename = $1
    order by indexname`,
    [tableName]
  )

  return {
    tableName,
    columns,
    checks,
    primaryKeys,
    foreignKeys,
    rls: !!rlsEnabled.relrowsecurity,
    policies,
    indexes,
  }
}

// Builds the ordered DDL statements to recreate one table (empty) inside
// `schema`. Foreign keys and indexes reference other tables/columns by
// unqualified name on purpose — they're executed with `search_path =
// schema, public`, so they resolve against the new schema's own tables.
function buildCreateTableStatements(info: TableInfo, schema: string) {
  const qualifiedTable = `"${schema}"."${info.tableName}"`
  const statements: string[] = []

  const checksByColumn: { [col: string]: { name: string; definition: string } } =
    {}
  const remainingChecks = []
  for (const check of info.checks) {
    const matches = info.columns.filter((c) =>
      check.definition.includes(c.name)
    )
    if (matches.length === 1) checksByColumn[matches[0].name] = check
    else remainingChecks.push(check)
  }

  const colDefs = info.columns.map((c) => {
    const isSerial = c.default?.startsWith('nextval(')
    let def: string
    if (isSerial) {
      def = `  ${c.name} ${c.type === 'bigint' ? 'bigserial' : 'serial'}`
    } else {
      def = `  ${c.name} ${c.type}`
      if (info.primaryKeys.length === 1 && info.primaryKeys[0] === c.name)
        def += ' PRIMARY KEY'
      if (c.default) def += ` DEFAULT ${c.default}`
      else if (c.identity) def += ` GENERATED ${c.always} AS IDENTITY`
      else if (c.gen) def += ` GENERATED ALWAYS AS (${c.gen}) ${c.stored}`
    }
    if (c.not_null) def += ' NOT NULL'
    const check = checksByColumn[c.name]
    if (check) def += ` CONSTRAINT ${check.name} CHECK ${check.definition}`
    return def
  })

  if (info.primaryKeys.length > 1) {
    colDefs.push(`  PRIMARY KEY (${info.primaryKeys.join(', ')})`)
  }
  for (const check of remainingChecks) {
    colDefs.push(`  CONSTRAINT ${check.name} CHECK ${check.definition}`)
  }

  statements.push(
    `CREATE TABLE IF NOT EXISTS ${qualifiedTable} (\n${colDefs.join(',\n')}\n)`
  )

  for (const fk of info.foreignKeys) {
    statements.push(
      `ALTER TABLE ${qualifiedTable} ADD CONSTRAINT ${fk.constraint_name} ${fk.definition}`
    )
  }

  for (const index of info.indexes) {
    // indexdef already includes `CREATE [UNIQUE] INDEX name ON public.table
    // USING ...` — retarget it at the new schema/table. Index names only
    // need to be unique within their own schema, so the name is kept as-is.
    statements.push(index.definition.replace(/ON public\.\S+/, `ON ${qualifiedTable}`))
  }

  if (info.rls) {
    statements.push(`ALTER TABLE ${qualifiedTable} ENABLE ROW LEVEL SECURITY`)
  }
  for (const policy of info.policies) {
    let stmt = `CREATE POLICY "${policy.policy_name}" ON ${qualifiedTable} `
    if (policy.command) stmt += `FOR ${policy.command} `
    if (policy.role) stmt += `TO ${policy.role} `
    if (policy.expression) stmt += `USING (${policy.expression}) `
    if (policy.with_check) stmt += `WITH CHECK (${policy.with_check})`
    statements.push(stmt)
  }

  return statements
}

export async function cloneSchemaForInstance(
  pg: SupabaseDirectClient,
  schema: string
) {
  if (!SCHEMA_NAME_RE.test(schema)) {
    throw new Error(
      `Refusing to clone into invalid schema name "${schema}" (expected instance_<id>).`
    )
  }

  const tableNames = await getPublicTableNames(pg)
  const tableInfos = await Promise.all(
    tableNames.map((name) => getTableInfo(pg, name))
  )
  const statementsByTable = tableInfos.map((info) =>
    buildCreateTableStatements(info, schema)
  )

  // Tables first (no FKs yet), then FKs/indexes/RLS/policies in a second
  // pass, so cross-table foreign keys never fail on load order.
  await pg.tx(async (t) => {
    await t.none(`CREATE SCHEMA "${schema}"`)

    for (const statements of statementsByTable) {
      await t.none(statements[0])
    }
    for (const statements of statementsByTable) {
      for (const statement of statements.slice(1)) {
        await t.none(statement)
      }
    }
  })
}
