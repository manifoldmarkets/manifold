import { sortBy } from 'lodash'
import { pgp, SupabaseDirectClient } from './init'
import { Column, DataFor, Row, TableName, Tables } from 'common/supabase/utils'

export async function getIds<T extends TableName>(
  db: SupabaseDirectClient,
  table: T
) {
  return db.map('select id from $1~', [table], (r) => r.id as string)
}
export function getInsertQuery<
  T extends TableName,
  ColumnValues extends Tables[T]['Insert']
>(table: T, values: ColumnValues) {
  const columnNames = Object.keys(values)
  const cs = new pgp.helpers.ColumnSet(columnNames, { table })
  const query = pgp.helpers.insert(values, cs)
  // Hack to properly cast values.
  const q = query.replace(/::(\w*)'/g, "'::$1")
  return q + ` returning *`
}

export async function insert<
  T extends TableName,
  ColumnValues extends Tables[T]['Insert']
>(db: SupabaseDirectClient, table: T, values: ColumnValues) {
  const query = getInsertQuery(table, values)
  return await db.one<Row<T>>(query)
}

export function bulkInsertQuery<
  T extends TableName,
  ColumnValues extends Tables[T]['Insert']
>(table: T, values: ColumnValues[], returnData = true) {
  if (values.length == 0) {
    return 'select 1 where false'
  }
  const columnNames = Object.keys(values[0])
  const cs = new pgp.helpers.ColumnSet(columnNames, { table })
  const query = pgp.helpers.insert(values, cs)
  // Hack to properly cast values.
  const q = query.replace(/::(\w*)'/g, "'::$1")
  return returnData ? `${q} returning *` : q
}

export async function bulkInsert<
  T extends TableName,
  ColumnValues extends Tables[T]['Insert']
>(db: SupabaseDirectClient, table: T, values: ColumnValues[]) {
  if (values.length == 0) {
    return []
  }
  const query = bulkInsertQuery(table, values)
  return await db.many<Row<T>>(query)
}

export async function update<
  T extends TableName,
  ColumnValues extends Tables[T]['Update']
>(
  db: SupabaseDirectClient,
  table: T,
  idField: Column<T>,
  values: ColumnValues
) {
  const columnNames = Object.keys(values)
  const cs = new pgp.helpers.ColumnSet(columnNames, { table })
  if (!(idField in values)) {
    throw new Error(`missing ${idField} in values for ${columnNames}`)
  }
  const clause = pgp.as.format(
    `${idField} = $1`,
    values[idField as keyof ColumnValues]
  )
  const query = pgp.helpers.update(values, cs) + ` WHERE ${clause}`
  // Hack to properly cast values.
  const q = query.replace(/::(\w*)'/g, "'::$1")
  return await db.one<Row<T>>(q + ` returning *`)
}

export function bulkUpdateQuery<
  T extends TableName,
  ColumnValues extends Tables[T]['Update']
>(table: T, idFields: Column<T>[], values: ColumnValues[]) {
  if (!values.length) return 'select 1 where false'
  const columnNames = Object.keys(values[0])
  const cs = new pgp.helpers.ColumnSet(columnNames, { table })
  const clause = idFields.map((f) => `v.${f} = t.${f}`).join(' and ')
  const query = pgp.helpers.update(values, cs) + ` WHERE ${clause}`
  // Hack to properly cast values.
  return query.replace(/::(\w*)'/g, "'::$1")
}

export async function bulkUpdate<
  T extends TableName,
  ColumnValues extends Tables[T]['Update']
>(
  db: SupabaseDirectClient,
  table: T,
  idFields: Column<T>[],
  values: ColumnValues[]
) {
  if (!values.length) return
  const query = bulkUpdateQuery(table, idFields, values)
  await db.none(query)
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
  if (!values.length) return []
  const query = bulkUpsertQuery(table, idField, values, onConflict)
  return await db.none(query)
}

export function bulkUpsertQuery<
  T extends TableName,
  ColumnValues extends Tables[T]['Insert'],
  Col extends Column<T>
>(table: T, idField: Col | Col[], values: ColumnValues[], onConflict?: string) {
  if (!values.length) return 'select 1 where false'

  const columnNames = Object.keys(values[0])
  const cs = new pgp.helpers.ColumnSet(columnNames, { table })
  const baseQuery = pgp.helpers.insert(values, cs)
  // Hack to properly cast values.
  const baseQueryReplaced = baseQuery.replace(/::(\w*)'/g, "'::$1")

  const primaryKey = Array.isArray(idField) ? idField.join(', ') : idField
  const upsertAssigns = cs.assignColumns({ from: 'excluded', skip: idField })
  return (
    `${baseQueryReplaced} on ` +
    (onConflict ? onConflict : `conflict(${primaryKey})`) +
    ' ' +
    (upsertAssigns ? `do update set ${upsertAssigns}` : `do nothing`)
  )
}

// Replacement for BulkWriter
export async function bulkUpdateData<T extends TableName>(
  db: SupabaseDirectClient,
  table: T,
  // TODO: explicit id field
  updates: (Partial<DataFor<T>> & { id: string | number })[]
) {
  if (updates.length > 0) {
    const values = updates
      .map(
        (update) =>
          `(${
            typeof update.id === 'string' ? `'${update.id}'` : update.id
          }, '${JSON.stringify(update)}'::jsonb)`
      )
      .join(',\n')

    await db.none(
      `update ${table} as c
        set data = data || v.update
      from (values ${values}) as v(id, update)
      where c.id = v.id`
    )
  }
}
export function updateDataQuery<T extends TableName>(
  table: T,
  idField: Column<T>,
  data: DataUpdate<T>
) {
  const { [idField]: id, ...rest } = data
  if (!id) throw new Error(`Missing id field ${idField} in data`)

  const basic: Partial<DataFor<T>> = {}
  const extras: string[] = []
  for (const key in rest) {
    const val = rest[key as keyof typeof rest]
    if (typeof val === 'function') {
      extras.push(val(key))
    } else {
      basic[key as keyof typeof rest] = val
    }
  }
  const sortedExtraOperations = sortBy(extras, (statement) =>
    statement.startsWith('-') ? -1 : 1
  )
  return pgp.as.format(
    `update ${table} set data = data
    ${sortedExtraOperations.join('\n')}
    || $1
    where ${idField} = '${id}' returning *`,
    [JSON.stringify(basic)]
  )
}

// Replacement for firebase updateDoc. Updates just the data field (what firebase would've replicated to)
export async function updateData<T extends TableName>(
  db: SupabaseDirectClient,
  table: T,
  idField: Column<T>,
  data: DataUpdate<T>
) {
  const query = updateDataQuery(table, idField, data)
  return await db.one<Row<T>>(query)
}

/*
 * this attempts to copy the firebase syntax
 * each returns a function that takes the field name and returns a sql string that updateData can handle
 */
export const FieldVal = {
  increment: (n: number) => (fieldName: string) =>
    `|| jsonb_build_object('${fieldName}', (data->'${fieldName}')::numeric + ${n})`,

  delete: () => (fieldName: string) => `- '${fieldName}'`,

  arrayConcat:
    (...values: string[]) =>
    (fieldName: string) => {
      return pgp.as.format(
        `|| jsonb_build_object($1, coalesce(data->$1, '[]'::jsonb) || $2:json)`,
        [fieldName, values]
      )
    },

  arrayRemove:
    (...values: string[]) =>
    (fieldName: string) => {
      return pgp.as.format(
        `|| jsonb_build_object($1, coalesce(data->$1,'[]'::jsonb) - '{$2:raw}'::text[])`,
        [fieldName, values.join(',')]
      )
    },
}
export type FieldValFunction = (fieldName: string) => string

type ValOrFieldVal<R extends Record<string, any>> = {
  [key in keyof R]?: R[key] | ((fieldName: string) => string)
}

export type DataUpdate<T extends TableName> = ValOrFieldVal<DataFor<T>>
