import { APIError, APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { TOURNAMENT_CONFIGS, ensureCommunityAssets } from 'shared/sports-markets'
import { convertContract } from 'common/supabase/contracts'
import { addGroupToContract } from 'shared/update-group-contracts-internal'
import { getUser } from 'shared/utils'
import { ENV } from 'common/envs/constants'

export const adminSportsCommunityMarket: APIHandler<
  'admin-sports-community-market'
> = async (props, auth) => {
  throwErrorIfNotAdmin(auth.uid)

  const { competitionCode, contractId, action } = props

  const config = TOURNAMENT_CONFIGS[competitionCode]
  if (!config) throw new APIError(400, `Unknown competition code: ${competitionCode}`)

  const pg = createSupabaseDirectClient()

  // Fetch the community dashboard, auto-creating it if it doesn't exist yet
  let dash = await pg.oneOrNone<{ id: string; title: string; items: string }>(
    `select id, title, items from dashboards where slug = $1 limit 1`,
    [config.communityDashboardSlug]
  )
  if (!dash) {
    const creatorId =
      ENV === 'DEV'
        ? config.manifoldSportsUserId.dev
        : config.manifoldSportsUserId.prod
    const creatorUser = await getUser(creatorId)
    if (!creatorUser)
      throw new APIError(500, `ManifoldSports user ${creatorId} not found`)
    await ensureCommunityAssets(
      config,
      creatorId,
      creatorUser.username,
      creatorUser.name,
      creatorUser.avatarUrl ?? '',
      pg
    )
    dash = await pg.one<{ id: string; title: string; items: string }>(
      `select id, title, items from dashboards where slug = $1 limit 1`,
      [config.communityDashboardSlug]
    )
  }

  // Look up by ID or slug — search results may not be synced to local Supabase by ID
  const contract = await pg.oneOrNone<{ id: string; slug: string }>(
    `select id, data->>'slug' as slug from contracts where id = $1 or data->>'slug' = $1 limit 1`,
    [contractId]
  )
  if (!contract) throw new APIError(404, `Contract ${contractId} not found`)

  const rawItems = dash.items as unknown
  const items: Array<{ type: string; slug?: string }> = Array.isArray(rawItems)
    ? rawItems
    : typeof rawItems === 'string'
    ? JSON.parse(rawItems || '[]')
    : []
  const questionItem = { type: 'question', slug: contract.slug }

  if (action === 'add') {
    const alreadyPresent = items.some(
      (i) => i.type === 'question' && i.slug === contract.slug
    )
    if (!alreadyPresent) {
      items.push(questionItem)
      await pg.none(
        `update dashboards set items = $1 where id = $2`,
        [JSON.stringify(items), dash.id]
      )
    }

    // Also tag the market with the community group
    const group = await pg.oneOrNone<{ id: string; slug: string }>(
      `select id, slug from groups where slug = $1 limit 1`,
      [config.communityGroupSlug]
    )
    if (group) {
      const contractRow = await pg.oneOrNone<{ data: any; importance_score: number | null }>(
        `select data, importance_score from contracts where id = $1`,
        [contract.id]
      )
      if (contractRow) {
        const fullContract = convertContract(contractRow)
        await addGroupToContract(pg, fullContract, group)
      }
    }
  } else {
    const filtered = items.filter(
      (i) => !(i.type === 'question' && i.slug === contract.slug)
    )
    await pg.none(
      `update dashboards set items = $1 where id = $2`,
      [JSON.stringify(filtered), dash.id]
    )

    // Remove community group tag from the market
    const group = await pg.oneOrNone<{ id: string }>(
      `select id from groups where slug = $1 limit 1`,
      [config.communityGroupSlug]
    )
    if (group) {
      await pg.none(
        `delete from group_contracts where contract_id = $1 and group_id = $2`,
        [contract.id, group.id]
      )
    }
  }

  return { success: true, dashboardId: dash.id, action, contractId }
}
