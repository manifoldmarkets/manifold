import { ModReport } from 'common/mod-report'
import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getModReports: APIHandler<'get-mod-reports'> = async () => {
  const pg = createSupabaseDirectClient()

  const reports = await pg.many<ModReport>(`
    SELECT 
      mr.*, 
      cc.data->>'content' AS comment_content, 
      c.question AS contract_question, 
      c.slug AS contract_slug, 
      creator.username AS creator_username,
      owner.data->>'username' AS owner_username,
      owner.data->>'avatarUrl' AS owner_avatarUrl, 
      (owner.data->>'isBannedFromPosting')::boolean AS owner_isBannedFromPosting
    FROM mod_reports mr
    JOIN contract_comments cc ON cc.comment_id = mr.comment_id
    JOIN contracts c ON c.id = mr.contract_id
    JOIN users creator ON creator.id = c.creator_id
    JOIN users owner ON owner.id = mr.user_id
  `)

  return { status: 'success', reports }
}
