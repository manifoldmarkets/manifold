import {
  PostgrestResponse,
  PostgrestSingleResponse,
} from '@supabase/supabase-js'

type QueryResponse = PostgrestResponse<any> | PostgrestSingleResponse<any>

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
