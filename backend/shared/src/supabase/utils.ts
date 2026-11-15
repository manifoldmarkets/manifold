import { chunk, sortBy } from 'lodash'
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
  return query + ` returning *`
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
  return returnData ? `${query} returning *` : query
}

export async function bulkInsert<
  T extends TableName,
  ColumnValues extends Tables[T]['Insert']
>(db: SupabaseDirectClient, table: T, values: ColumnValues[]) {
  if (values.length == 0) {
    return []
  }
  const batches = chunk(values, 25000)
  const results: Row<T>[] = []
  for (const batch of batches) {
    const query = bulkInsertQuery(table, batch)
    const rows = await db.many<Row<T>>(query)
    results.push(...rows)
  }
  return results
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
  const clause = pgp.as.format(`$1:alias = $2`, [
    idField,
    values[idField as keyof ColumnValues],
  ])
  const query = pgp.helpers.update(values, cs) + ` WHERE ${clause}`
  return await db.one<Row<T>>(query + ` returning *`)
}

export function bulkUpdateQuery<
  T extends TableName,
  ColumnValues extends Tables[T]['Update']
>(table: T, idFields: Column<T>[], values: ColumnValues[]) {
  if (!values.length) return 'select 1 where false'

  // Filter out idFields from the columns to update to avoid pg errors about generated ALWAYS columns
  const updateColumns = Object.keys(values[0]).filter(
    (col) => !idFields.includes(col as Column<T>)
  )
  const allColumns = [...idFields, ...updateColumns]
  const cs = new pgp.helpers.ColumnSet(updateColumns, { table })

  // A VALUES list carries no column types, so lead with a row of typed nulls
  // taken from the table's own row type: Postgres then resolves each column
  // to the table's type and coerces the literals below to it. The null ids
  // never match the join, so this row updates nothing.
  const typedNulls = pgp.as.format('($1:raw)', [
    allColumns
      .map((col) => pgp.as.format('(null::$1:alias).$2:alias', [table, col]))
      .join(','),
  ])
  const formattedValues = values.map((row) =>
    pgp.as.format('($1:csv)', [
      allColumns.map((col) => row[col as keyof ColumnValues]),
    ])
  )

  const clause = idFields
    .map((f) => pgp.as.format('v.$1:alias = t.$1:alias', [f]))
    .join(' and ')

  return pgp.as.format(
    `update $1:alias as t set $2:raw from (values $3:raw) as v($4:name) where $5:raw`,
    [
      table,
      cs.assignColumns({ from: 'v' }),
      [typedNulls, ...formattedValues].join(','),
      allColumns,
      clause,
    ]
  )
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
>(
  table: T,
  idField: Col | Col[],
  values: ColumnValues[],
  onConflict?: string,
  updateColumnExpressions?: Partial<Record<Column<T>, string>>
) {
  if (!values.length) return 'select 1 where false'

  const columnNames = Object.keys(values[0])
  const cs = new pgp.helpers.ColumnSet(columnNames, { table })
  const baseQuery = pgp.helpers.insert(values, cs)

  const primaryKey = Array.isArray(idField) ? idField.join(', ') : idField
  const upsertAssigns = updateColumnExpressions
    ? columnNames
        .filter((column) =>
          Array.isArray(idField)
            ? !idField.includes(column as Col)
            : column !== idField
        )
        .map((column) => {
          const escapedColumn = pgp.as.name(column)
          const expression =
            updateColumnExpressions[column as Column<T>] ??
            `excluded.${escapedColumn}`
          return `${escapedColumn}=${expression}`
        })
        .join(',')
    : cs.assignColumns({ from: 'excluded', skip: idField })
  return (
    `${baseQuery} on ` +
    (onConflict ? onConflict : `conflict(${primaryKey})`) +
    ' ' +
    (upsertAssigns ? `do update set ${upsertAssigns}` : `do nothing`)
  )
}

export function bulkUpdateDataQuery<T extends TableName>(
  table: T,
  // TODO: explicit id field
  updates: (Partial<DataFor<T>> & { id: string | number })[]
) {
  if (updates.length === 0) return 'select 1 where false'

  const values = updates
    .map((update) =>
      pgp.as.format('($1, $2::jsonb)', [update.id, JSON.stringify(update)])
    )
    .join(',\n')

  return pgp.as.format(
    `update $1:alias as c
    set data = data || v.update
    from (values $2:raw) as v(id, update)
    where c.id = v.id`,
    [table, values]
  )
}

export async function bulkUpdateData<T extends TableName>(
  db: SupabaseDirectClient,
  table: T,
  updates: (Partial<DataFor<T>> & { id: string | number })[]
) {
  const query = bulkUpdateDataQuery(table, updates)
  await db.none(query)
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
  // Format in a single pass with every value as a parameter (:alias leaves
  // plain identifiers unquoted, so normal output is unchanged). The FieldVal
  // fragments are already formatted SQL, so they go in via :raw rather than
  // being spliced into the template: pg-promise does not re-scan substituted
  // values, so `$n` text inside a fragment's quoted values stays inert.
  return pgp.as.format(
    `update $1:alias set data = data
    $2:raw
    || $3
    where $4:alias = $5 returning *`,
    [
      table,
      sortedExtraOperations.join('\n'),
      JSON.stringify(basic),
      idField,
      id,
    ]
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
  increment: (n: number) => {
    // Interpolating NaN/Infinity used to produce invalid SQL and fail the
    // write; keep failing loudly rather than storing a non-finite number.
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      throw new Error(`FieldVal.increment: expected a finite number, got ${n}`)
    }
    return (fieldName: string) =>
      pgp.as.format(`|| jsonb_build_object($1, (data->$1)::numeric + $2)`, [
        fieldName,
        n,
      ])
  },

  delete: () => (fieldName: string) => pgp.as.format(`- $1`, [fieldName]),

  arrayConcat: (...values: string[]) => {
    // Untyped query results can sneak undefined past the string[] signature,
    // and :json would silently serialize it as a json null inside the array
    // (e.g. groupSlugs [null, null, null], which broke blocked-topic filters).
    if (values.some((v) => v == null)) {
      throw new Error(
        `FieldVal.arrayConcat: got null/undefined in values: ${JSON.stringify(
          values
        )}`
      )
    }
    return (fieldName: string) => {
      return pgp.as.format(
        `|| jsonb_build_object($1, coalesce(data->$1, '[]'::jsonb) || $2:json)`,
        [fieldName, values]
      )
    }
  },

  arrayRemove: (...values: string[]) => {
    if (values.some((v) => v == null)) {
      throw new Error(
        `FieldVal.arrayRemove: got null/undefined in values: ${JSON.stringify(
          values
        )}`
      )
    }
    return (fieldName: string) => {
      return pgp.as.format(
        `|| jsonb_build_object($1, coalesce(data->$1,'[]'::jsonb) - $2::text[])`,
        [fieldName, values]
      )
    }
  },
}
export type FieldValFunction = (fieldName: string) => string

type ValOrFieldVal<R extends Record<string, any>> = {
  [key in keyof R]?: R[key] | ((fieldName: string) => string)
}

export type DataUpdate<T extends TableName> = ValOrFieldVal<DataFor<T>>
