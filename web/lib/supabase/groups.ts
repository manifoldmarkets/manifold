import { db } from './db'
import { run } from 'common/supabase/utils'
import { Group } from 'common/group'
export type SearchGroupInfo = Pick<
  Group,
  | 'id'
  | 'name'
  | 'slug'
  | 'about'
  | 'totalContracts'
  | 'totalMembers'
  | 'anyoneCanJoin'
>

export async function searchGroups(prompt: string, limit: number) {
  const query = db
    .from('groups')
    .select(
      'id, data->name, data->about, data->slug, data->totalMembers, data->totalContracts, data->anyoneCanJoin'
    )
    .order('data->totalMembers', { ascending: false } as any)
    .limit(limit)
  if (prompt)
    query.or(`data->>name.ilike.%${prompt}%,data->>about.ilike.%${prompt}%`)

  const { data } = await run(query)
  return data as SearchGroupInfo[]
}
