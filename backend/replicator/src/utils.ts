import * as pgPromise from 'pg-promise'
import {
  Tables,
  TableName,
  getInstanceHostname,
} from '../../common/supabase/utils'

export const pgp = pgPromise()

export type SupabaseDirectClient = ReturnType<typeof createSupabaseDirectClient>

function getMessage(obj: unknown) {
  if (typeof obj === 'string') {
    return obj
  } else if (obj instanceof Error) {
    return `${obj.message} ${obj.stack}`
  } else {
    return JSON.stringify(obj)
  }
}

export function log(severity: string, message: string, details?: unknown) {
  if (details == null) {
    console.log(JSON.stringify({ severity, message }))
  } else {
    console.log(
      JSON.stringify({ severity, message: `${message} ${getMessage(details)}` })
    )
  }
}

// would be nice to reuse these between this project and functions project

export function createSupabaseDirectClient(
  instanceId: string,
  password: string
) {
  return pgp({
    host: `db.${getInstanceHostname(instanceId)}`,
    port: 5432,
    user: 'postgres',
    password: password,
  })
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
