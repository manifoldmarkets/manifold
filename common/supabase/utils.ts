import {
  PostgrestResponse,
  PostgrestSingleResponse,
  SupabaseClient as SupabaseClientGeneric,
  SupabaseClientOptions as SupabaseClientOptionsGeneric,
  createClient as createClientGeneric,
} from '@supabase/supabase-js'
import { Database } from './schema'

export type QueryResponse<T> = PostgrestResponse<T> | PostgrestSingleResponse<T>

export type SupabaseClient = SupabaseClientGeneric<Database, 'public'>

export function createClient(
  url: string,
  key: string,
  opts?: SupabaseClientOptionsGeneric<'public'>
) {
  return createClientGeneric(url, key, opts) as SupabaseClient
}

export async function run<T, R extends QueryResponse<T>>(q: PromiseLike<R>) {
  const response = await q
  if (response.error != null) {
    throw response.error
  } else {
    // mqp: turn on typing once it works for JSON accesses, see
    // https://github.com/supabase/postgrest-js/pull/380
    return { data: response.data as any, count: response.count }
  }
}
