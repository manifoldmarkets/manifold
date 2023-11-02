import { pgp, SupabaseDirectClient } from './init'
import { DataFor, Tables, TableName, Column } from 'common/supabase/utils'

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

export async function bulkInsert<
  T extends TableName,
  ColumnValues extends Tables[T]['Insert']
>(db: SupabaseDirectClient, table: T, values: ColumnValues[]) {
  if (values.length) {
    const columnNames = Object.keys(values[0])
    const cs = new pgp.helpers.ColumnSet(columnNames, { table })
    const query = pgp.helpers.insert(values, cs)
    // Hack to properly cast jsonb values.
    const q = query.replace(/::jsonb'/g, "'::jsonb")
    await db.none(q)
  }
}

export async function bulkUpdate<
  T extends TableName,
  ColumnValues extends Tables[T]['Update'],
  Row extends Tables[T]['Row']
>(
  db: SupabaseDirectClient,
  table: T,
  idFields: (string & keyof Row)[],
  values: ColumnValues[]
) {
  if (values.length) {
    const columnNames = Object.keys(values[0])
    const cs = new pgp.helpers.ColumnSet(columnNames, { table })
    const clause = idFields.map((f) => `v.${f} = t.${f}`).join(' and ')
    const query = pgp.helpers.update(values, cs) + ` WHERE ${clause}`
    // Hack to properly cast jsonb values.
    const q = query.replace(/::jsonb'/g, "'::jsonb")
    await db.none(q)
  }
}

export async function bulkUpsert<
  T extends TableName,
  ColumnValues extends Tables[T]['Insert'],
  Col extends Column<T>
>(
  db: SupabaseDirectClient,
  table: T,
  idField: Col | Col[],
  values: ColumnValues[],
  onConflict?: string
) {
  if (!values.length) return

  const columnNames = Object.keys(values[0])
  const cs = new pgp.helpers.ColumnSet(columnNames, { table })
  const baseQuery = pgp.helpers.insert(values, cs)
  // Hack to properly cast jsonb values.
  const baseQueryReplaced = baseQuery.replace(/::jsonb'/g, "'::jsonb")

  const primaryKey = Array.isArray(idField) ? idField.join(', ') : idField
  const upsertAssigns = cs.assignColumns({ from: 'excluded', skip: idField })
  const query = `${baseQueryReplaced} on ${
    onConflict ? onConflict : `conflict(${primaryKey})`
  } do update set ${upsertAssigns}`
  await db.none(query)
}

// Replacement for firebase updateDoc. Updates just the data field (what firebase would've replicated to)
export async function updateData<
  T extends TableName,
  K extends Record<string, any>
>(db: SupabaseDirectClient, table: T, id: string, data: Partial<K>) {
  await db.none(`update ${table} set data = data || $1 where id = '${id}'`, [
    JSON.stringify(data),
  ])
}
