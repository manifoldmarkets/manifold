import { Contract } from 'common/contract'
import { ENV_CONFIG } from 'common/envs/constants'

export const getShareUrl = (contract: Contract) =>
  `https://${ENV_CONFIG.domain}/${contract.creatorUsername}/${contract.slug}`

export const getTopicShareUrl = (groupSlug: string) =>
  `https://${ENV_CONFIG.domain}/topic/${groupSlug}`

export const getReferralCodeFromUser = (userId: string | undefined) =>
  (userId?.slice(0, 5) ?? '').toUpperCase().replace(/0/g, '#')
