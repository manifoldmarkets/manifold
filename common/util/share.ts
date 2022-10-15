import { Contract } from 'common/contract'
import { ENV_CONFIG } from 'common/envs/constants'
import { User } from 'common/user'

export const getShareUrl = (contract: Contract, user: User | undefined | null) =>
  `https://${ENV_CONFIG.domain}/${contract.creatorUsername}/${contract.slug}${
    user?.username && contract.creatorUsername !== user?.username
      ? '?referrer=' + user?.username
      : ''
  }`
