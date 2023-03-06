import { pgp, SupabaseDirectClient } from './init'
import { DataFor, Tables, TableName } from 'common/supabase/utils'

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
    await db.none(query)
  }
}

export async function bulkUpdate<
  T extends TableName,
  ColumnValues extends Tables[T]['Update'],
  Row extends Tables[T]['Row']
>(
  db: SupabaseDirectClient,
  table: T,
  idField: string & keyof Row,
  values: ColumnValues[]
) {
  if (values.length) {
    const columnNames = Object.keys(values[0])
    const cs = new pgp.helpers.ColumnSet(columnNames, { table })
    const query =
      pgp.helpers.update(values, cs) + ` WHERE v.${idField} = t.${idField}`
    await db.none(query)
  }
}

export async function bulkUpsert<
  T extends TableName,
  ColumnValues extends Tables[T]['Insert'],
  Row extends Tables[T]['Row']
>(
  db: SupabaseDirectClient,
  table: T,
  idField: string & keyof Row,
  values: ColumnValues[]
) {
  const columnNames = Object.keys(values[0])
  const cs = new pgp.helpers.ColumnSet(columnNames, { table })
  const baseQuery = pgp.helpers.insert(values, cs)
  const upsertAssigns = cs.assignColumns({ from: 'excluded', skip: idField })
  const query = `${baseQuery} on conflict(${idField}) do update set ${upsertAssigns}`
  await db.none(query)
}
