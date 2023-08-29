import { authEndpoint } from 'api/helpers'
import { generateEmbeddings } from 'shared/helpers/openai-utils'
import { z } from 'zod'
import { MAX_QUESTION_LENGTH } from 'common/contract'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { convertGroup } from 'common/supabase/groups'
import { log } from 'shared/utils'
const bodySchema = z.object({
  question: z.string().min(1).max(MAX_QUESTION_LENGTH),
})
const GROUPS_SLUGS_TO_IGNORE = [
  'olivia',
  'nathans-dashboard',
  'tomeks-specials',
  'austin-less-wrong-2023-predictions',
  'fantasy-football-stock-exchange',
  'ancient-markets',
  'spam',
  'test',
  'sf-bay-rationalists',
]
export const getsimilargroupstocontract = authEndpoint(async (req) => {
  const { question } = bodySchema.parse(req.body)
  const embedding = await generateEmbeddings(question)
  if (!embedding) return { error: 'Failed to generate embeddings' }
  const pg = createSupabaseDirectClient()
  log('Finding similar groups to', question)
  const groups = await pg.map(
    `
      select *, (embedding <=> ($1)::vector) as distance from groups
          join group_embeddings on groups.id = group_embeddings.group_id
            where (embedding <=> ($1)::vector) < 0.127
            and importance_score > 0.15
            and privacy_status = 'public'
            and slug not in ($2:list)
      order by (1-(embedding <=> ($1)::vector))*importance_score desc 
            limit 4
    `,
    [embedding, GROUPS_SLUGS_TO_IGNORE],
    (group) => {
      log('group:', group.name, 'distance:', group.distance)
      return convertGroup(group)
    }
  )
  return { groups }
})
