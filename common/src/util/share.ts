import { Contract } from 'common/contract'
import { BASE_URL } from 'common/envs/constants'

export const getShareUrl = (contract: Contract, username: string | undefined) =>
  `${BASE_URL}/${contract.creatorUsername}/${contract.slug}${
    username ? queryString(username) : ''
  }`

const queryString = (username: string) => {
  try {
    return '?r=' + btoa(username).replace(/=/g, '')
  } catch (e) {
    return '?referrer=' + username
  }
}
