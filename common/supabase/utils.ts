import {
  PostgrestResponse,
  PostgrestSingleResponse,
  SupabaseClient as SupabaseClientGeneric,
} from '@supabase/supabase-js'
import { Database } from './schema'

export type QueryResponse =
  | PostgrestResponse<any>
  | PostgrestSingleResponse<any>

export type SupabaseClient = SupabaseClientGeneric<Database>

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
