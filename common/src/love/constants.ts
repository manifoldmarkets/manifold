import { PROD_MANIFOLD_LOVE_GROUP_ID } from 'common/supabase/groups'
import { Contract } from 'common/contract'
import { PROD_MANIFOLD_LOVE_GROUP_SLUG } from 'common/envs/constants'
import { isProd } from 'common/envs/is-prod'

export const manifoldLoveUserId = isProd()
  ? 'tRZZ6ihugZQLXPf6aPRneGpWLmz1'
  : 'RlXR2xa4EFfAzdCbSe45wkcdarh1'
export const manifoldLoveRelationshipsGroupId = isProd()
  ? PROD_MANIFOLD_LOVE_GROUP_ID
  : '77df8782-34b7-4daa-89f4-a75c8ea844d4'

export const isManifoldLoveContract = (contract: Contract) =>
  contract.groupSlugs?.includes(PROD_MANIFOLD_LOVE_GROUP_SLUG)

export const MIN_BET_AMOUNT_FOR_NEW_MATCH = 50

export const MAX_COMPATIBILITY_QUESTION_LENGTH = 240

export const LIKE_COST = 50