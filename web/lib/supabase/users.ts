import { db } from './db'
import { run } from 'common/supabase/utils'
import { User } from 'common/user'
import { capitalize, lowerCase, uniqBy } from 'lodash'

export type SearchUserInfo = Pick<
  User,
  'id' | 'name' | 'username' | 'avatarUrl'
>
const isUpperCase = (str: string) => /^[A-Z]*$/.test(str)
export async function searchUsers(prompt: string, limit: number) {
  const { data } =
    prompt != ''
      ? await run(
          db
            .from('users')
            .select('id, data->name, data->username, data->avatarUrl')
            .eq('data->>username', prompt)
            .limit(limit)
        )
      : await run(
          db
            .from('users')
            .select('id, data->name, data->username, data->avatarUrl')
            .order('data->followerCountCached', { ascending: false } as any)
            .limit(limit)
        )

  const casePrompt = isUpperCase(prompt[0])
    ? lowerCase(prompt)
    : capitalize(prompt)
  const { data: caseData } = await run(
    db
      .from('users')
      .select('id, data->name, data->username, data->avatarUrl')
      .eq('data->>username', casePrompt)
      .limit(limit)
  )

  const { data: similarData } = await run(
    db
      .from('users')
      .select('id, data->name, data->username, data->avatarUrl')
      .or(`data->>username.ilike.%${prompt}%,data->>name.ilike.%${prompt}%`)
      .order('data->lastBetTime', {
        ascending: false,
        nullsFirst: false,
      } as any)
      .limit(limit)
  )
  return uniqBy([...data, ...caseData, ...similarData], 'id').slice(0, limit)
}
