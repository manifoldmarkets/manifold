import { ENV_CONFIG } from 'common/envs/constants'
import { Group } from 'common/group'

export const getGroupInviteUrl = (group: Group, inviteSlug: string) =>
  `https://${ENV_CONFIG.domain}/group-invite/${inviteSlug}`

export const truncatedUrl = (fullUrl: string): string => {
  // Remove the "https://" prefix
  const truncatedUrl = fullUrl.replace(/^https?:\/\//, '')
  return truncatedUrl
}
