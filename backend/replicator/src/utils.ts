import * as pgPromise from 'pg-promise'
import {
  Tables,
  TableName,
  getInstanceHostname,
} from '../../../common/supabase/utils'
import { createSupabaseDirectClient } from '../../shared/supabase/init'

export const pgp = pgPromise()

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
