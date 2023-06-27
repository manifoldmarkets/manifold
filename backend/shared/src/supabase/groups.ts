import { SupabaseDirectClient } from 'shared/supabase/init'
import {
  NON_PREDICTIVE_GROUP_ID,
  NON_PREDICTIVE_TOPIC_NAME,
} from 'common/supabase/groups'

export const updateNonPredictiveEmbedding = async (
  pg: SupabaseDirectClient
) => {
  await pg.none(
    `
    WITH group_contracts AS (
      SELECT contract_id
      FROM group_contracts
      WHERE group_id = $1
      ),
     embeddings AS (
         SELECT ce.embedding
         FROM contract_embeddings AS ce
         JOIN group_contracts AS gc ON ce.contract_id = gc.contract_id
     ),
    average as (
        select avg(embeddings.embedding) as average_embedding from embeddings
    )
    insert into topic_embeddings (topic, created_at, embedding)
    values ($2, now(), (select average_embedding from average))
    on conflict (topic) do update set embedding = excluded.embedding;
`,
    [NON_PREDICTIVE_GROUP_ID, NON_PREDICTIVE_TOPIC_NAME]
  )
}
