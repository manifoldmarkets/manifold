import { pgp, SupabaseDirectClient } from './init'
import { Column, DataFor, Tables, TableName } from 'common/supabase/utils'

export async function getIds<T extends TableName>(
  db: SupabaseDirectClient,
  table: T
) {
  return db.map('select id from $1~', [table], (r) => r.id as string)
}

export async function getAll<T extends TableName>(
  db: SupabaseDirectClient,
  table: T
) {
  return db.map('select data from $1~', [table], (r) => r.data as DataFor<T>)
}

export async function bulkInsert<T extends TableName>(
  db: SupabaseDirectClient,
  table: T,
  values: Tables[T]['Insert'][]
) {
  if (values.length) {
    const columnNames = Object.keys(values[0])
    const cs = new pgp.helpers.ColumnSet<T>(columnNames, { table })
    const query = pgp.helpers.insert(values, cs)
    // Hack to properly cast jsonb values.
    const q = query.replace(/::jsonb'/g, "'::jsonb")
    await db.none(q)
  }
}

export async function bulkUpdate<T extends TableName>(
  db: SupabaseDirectClient,
  table: T,
  key: Column<T>,
  values: Tables[T]['Update'][]
) {
  if (values.length) {
    const columnNames = Object.keys(values[0])
    const cs = new pgp.helpers.ColumnSet<T>(columnNames, { table })
    const query =
      pgp.helpers.update(values, cs) + ` WHERE v.${key} = t.${key}`
    // Hack to properly cast jsonb values.
    const q = query.replace(/::jsonb'/g, "'::jsonb")
    await db.none(q)
  }
}

export async function bulkUpsert<T extends TableName>(
  db: SupabaseDirectClient,
  table: T,
  key: Column<T>[],
  values: Tables[T]['Insert'][]
) {
  const columnNames = Object.keys(values[0])
  const cs = new pgp.helpers.ColumnSet<T>(columnNames, { table })
  const baseQuery = pgp.helpers.insert(values, cs)
  // Hack to properly cast jsonb values.
  const baseQueryReplaced = baseQuery.replace(/::jsonb'/g, "'::jsonb")
  const keyColumns = new pgp.helpers.ColumnSet<T>(key, { table })
  const upsertAssigns = cs.assignColumns({ from: 'excluded', skip: key })
  const query = '$1:raw on conflict ($2:raw) do update set $3:raw'
  await db.none(query, [baseQueryReplaced, keyColumns.names, upsertAssigns])
}

export async function bulkDelete<T extends TableName>(
  db: SupabaseDirectClient,
  table: T,
  tuples: Tables[T]['Row'][]
) {
  const columnNames = Object.keys(tuples[0])
  const cs = new pgp.helpers.ColumnSet<T>(columnNames, { table })
  const values = pgp.helpers.values(tuples, columnNames);
  const baseQuery = 'delete from $1:name where ($2:raw) in ($3:raw)'
  await db.none(baseQuery, [table, cs.names, values])
}
