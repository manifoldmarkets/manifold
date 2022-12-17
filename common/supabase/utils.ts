import {
  PostgrestResponse,
  PostgrestSingleResponse,
  SupabaseClient as SupabaseClientGeneric,
  SupabaseClientOptions as SupabaseClientOptionsGeneric,
  createClient as createClientGeneric,
} from '@supabase/supabase-js'
import { Database } from './schema'

export type QueryResponse =
  | PostgrestResponse<any>
  | PostgrestSingleResponse<any>

export type SupabaseClient = SupabaseClientGeneric<Database, 'public'>

export function createClient(
  url: string,
  key: string,
  opts?: SupabaseClientOptionsGeneric<'public'>
) {
  return createClientGeneric(url, key, opts) as SupabaseClient
}

export async function run<T extends QueryResponse = QueryResponse>(
  q: PromiseLike<T>
) {
  const response = await q
  if (response.error != null) {
    throw response.error
  } else {
    return { data: response.data, count: response.count }
  }
}
