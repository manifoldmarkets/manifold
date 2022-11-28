import { Contract } from 'common/contract'
import { ENV_CONFIG } from 'common/envs/constants'

export const getShareUrl = (contract: Contract, username: string | undefined) =>
  `https://${ENV_CONFIG.domain}/${contract.creatorUsername}/${contract.slug}${
    username ? '?referrer=' + username : ''
  }`
