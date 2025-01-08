import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError } from 'common/api/utils'
import { convertContract } from 'common/supabase/contracts'
import { contractColumnsToSelect } from 'shared/utils'
import { first } from 'lodash'
import { convertGroup } from 'common/supabase/groups'
import { Contract } from 'common/contract'
import { convertContractComment } from 'common/supabase/comments'
import { ContractMetric } from 'common/contract-metric'
import { ContractComment } from 'common/comment'
import { type APIHandler } from './helpers/endpoint'

// This could replace the supabase js calls in getStaticProps
export const getMarketProps: APIHandler<'get-market-props'> = async (
  props: { id?: string; slug?: string },
  auth
) => {
  if (auth.creds.kind === 'key') {
    throw new APIError(401, 'API key is not allowed')
  }
  const pg = createSupabaseDirectClient()
  let contractId = 'id' in props ? props.id : undefined
  const contractSlug = 'slug' in props ? props.slug : undefined
  if (!contractId && !contractSlug) {
    throw new APIError(400, 'id or slug is required')
  }
  let contract: Contract | undefined = undefined
  if (!contractId) {
    const result = await pg.oneOrNone(
      `select id,slug from contracts where slug = $1`,
      [contractSlug]
    )
    if (!result) throw new APIError(404, 'Contract not found')
    contractId = result.id
  }
  const results = await pg.multi(
    `
    select ${contractColumnsToSelect} from contracts
    where id = $1;
            
    select * from chart_annotations where contract_id = $1
    order by event_time;
    
    select g.id, g.name, g.slug, g.importance_score, g.privacy_status, g.total_members
    from group_contracts gc
    join groups g on gc.group_id = g.id
    where gc.contract_id = $1
    order by g.importance_score desc;

    with parent_comments as (
      select data, created_time, comment_id
      from contract_comments
      where contract_id = $1
      and data->>'replyToCommentId' is null
      order by created_time desc
      limit 20
    ),
    all_comments as (
      select data, created_time, comment_id
      from parent_comments
      union all
      select cc.data, cc.created_time, cc.comment_id  
      from contract_comments cc
      join parent_comments pc on cc.data->>'replyToCommentId' = pc.comment_id
      where cc.contract_id = $1
    )
    select data
    from all_comments
    order by created_time desc;

    select data
    from contract_comments
    where contract_id = $1
    and data->>'pinned' = 'true'
    order by created_time desc;

    select data
    from user_contract_metrics
    where contract_id = $1
    and has_yes_shares
    and exists (select 1 from contracts where id = $1 and mechanism = 'cpmm-1')
    order by total_shares_yes desc
    limit 50;

    select data
    from user_contract_metrics
    where contract_id = $1
    and has_no_shares 
    and exists (select 1 from contracts where id = $1 and mechanism = 'cpmm-1')
    order by total_shares_no desc
    limit 50;

    select data
    from user_contract_metrics
    where contract_id = $1
    and exists (select 1 from contracts where id = $1 and resolution_time is not null)
    and answer_id is null
    order by profit desc
    limit 10;

    select count(distinct user_id) as count from user_contract_metrics
     where contract_id = $1
     and has_shares;

    with contract as (
        select creator_id, slug from contracts where id = $1
    )
    select title, slug
    from dashboards
    where visibility = 'public'
      and (
        importance_score > 0
        or politics_importance_score > 0
        or ai_importance_score > 0
        or creator_id = (select creator_id from contract)
      )
      and items::jsonb @> concat('[{"type": "question", "slug": "', (select slug from contract), '"}]')::jsonb
    order by importance_score desc,
             politics_importance_score desc,
             ai_importance_score desc,
             created_time
    limit 1;
    select ${contractColumnsToSelect} from contracts
    where id = (select data->>'siblingContractId' from contracts where id = $1);
  `,
    [contractId]
  )
  contract = first(results[0]?.map(convertContract))
  if (!contract) throw new APIError(404, 'Contract not found')
  const chartAnnotations = results[1]
  const topics = results[2].map(convertGroup)
  const allComments = results[3].map(convertContractComment)
  const comments = filterComments(allComments)
  const pinnedComments = results[4].map(convertContractComment)
  const yesMetrics = results[5].map((r) => r.data as ContractMetric)
  const noMetrics = results[6].map((r) => r.data as ContractMetric)
  const topContractMetrics = results[7].map((r) => r.data as ContractMetric)
  const totalPositions = results[8]?.[0]?.count ?? 0
  const dashboards = results[9]
  const siblingContract = first(results[10]?.map(convertContract))
  return {
    contract,
    chartAnnotations,
    topics,
    comments,
    pinnedComments,
    userPositionsByOutcome: {
      YES: yesMetrics,
      NO: noMetrics,
    },
    topContractMetrics,
    totalPositions,
    dashboards,
    siblingContract,
  }
}

const filterComments = (comments: ContractComment[]) => {
  const parents = comments.filter((c) => !c.replyToCommentId)
  const approximateTotalComments = 25
  const targetComments = [] as ContractComment[]
  for (const parent of parents) {
    const parentComment = parent as ContractComment
    targetComments.push(parentComment)
    if (targetComments.length >= approximateTotalComments) break

    const childrenComments = comments.filter(
      (c) => (c as ContractComment).replyToCommentId === parentComment.id
    )

    const remainingSpace = approximateTotalComments - targetComments.length
    const childrenToAdd = childrenComments.slice(0, remainingSpace)
    targetComments.push(...childrenToAdd)

    if (targetComments.length >= approximateTotalComments) break
  }
  return targetComments
}
