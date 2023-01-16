import { Contract } from 'common/contract'
import { ENV_CONFIG } from 'common/envs/constants'

export const getShareUrl = (contract: Contract, username: string | undefined) =>
  `https://${ENV_CONFIG.domain}/${contract.creatorUsername}/${contract.slug}${
    username ? queryString(username) : ''
  }`

const queryString = (username: string) => {
  try {
    return '?r=' + btoa(username).replace(/=/g, '')
  } catch (e) {
    return '?referrer=' + username
  }
}
