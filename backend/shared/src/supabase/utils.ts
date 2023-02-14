import { pgp, SupabaseDirectClient } from './init'
import { Tables, TableName } from 'common/supabase/utils'

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
  idField: keyof Row,
  values: ColumnValues[]
) {
  if (values.length) {
    const columnNames = Object.keys(values[0])
    const cs = new pgp.helpers.ColumnSet(columnNames, { table })
    const query =
      pgp.helpers.update(values, cs) +
      ` WHERE v.${String(idField)} = t.${String(idField)}`
    await db.none(query)
  }
}
