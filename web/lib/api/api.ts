import { JSONContent } from '@tiptap/core'
import { apiWithAuth, callWithAuth } from 'client-common/lib/api'
import { APIParams, APIPath } from 'common/api/schema'
import { getApiUrl } from 'common/api/utils'
import { Bet } from 'common/bet'
import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { BaseDashboard, DashboardItem } from 'common/dashboard'
import { Group } from 'common/group'
import { ReportProps } from 'common/report'
import { auth } from '../firebase/users'
export { APIError } from 'common/api/utils'

export async function call(
  url: string,
  method: 'POST' | 'PUT' | 'GET',
  params?: any
) {
  return callWithAuth(url, method, auth, params)
}
export async function api<P extends APIPath>(
  path: P,
  params: APIParams<P> = {}
) {
  return apiWithAuth(path, auth, params)
}

// helper function for the old apis so we don't have to migrate them
function curriedAPI<P extends APIPath>(path: P) {
  return (params: APIParams<P>) => api(path, params)
}

export function createUser(params: any) {
  return call(getApiUrl('createuser'), 'POST', params)
}

export function claimManalink(params: any) {
  return call(getApiUrl('claimmanalink'), 'POST', params)
}

export function createGroup(params: any) {
  return call(getApiUrl('creategroup'), 'POST', params)
}

export function updateGroup(params: { id: string } & Partial<Group>) {
  return call(getApiUrl('updategroup'), 'POST', params)
}

export function boostMarket(params: any) {
  return call(getApiUrl('boost-market'), 'POST', params)
}

export function markAllNotifications(params: any) {
  return call(getApiUrl('markallnotifications'), 'POST', params)
}

export function registerDiscordId(params: any) {
  return call(getApiUrl('registerdiscordid'), 'POST', params)
}

export function getUserIsFollowingTopic(params: { groupSlug: string }) {
  return call(getApiUrl('getuserisgroupmember'), 'POST', params)
}

export function completeQuest(params: any) {
  return call(getApiUrl('completequest'), 'POST', params)
}

export function getSupabaseToken() {
  return call(getApiUrl('getsupabasetoken'), 'GET')
}

export function updateUserDisinterestEmbedding(params: {
  contractId: string
  creatorId: string
  feedId?: number
  removeContract?: boolean
}) {
  return call(getApiUrl('update-user-disinterest-embedding'), 'POST', params)
}

export const searchContracts = curriedAPI('search-markets-full')

export function deleteMarket(params: { contractId: string }) {
  return call(getApiUrl('delete-market'), 'POST', params) as Promise<{
    status: 'success'
  }>
}

export function setTV(params: {
  streamId: string
  slug: string
  source: string
  title: string
  startTime: string
  endTime: string
}) {
  return call(getApiUrl('settv'), 'POST', params) as Promise<{
    status: 'success'
  }>
}

export function deleteTV(id: string) {
  return call(getApiUrl('deletetv'), 'POST', { id }) as Promise<{
    status: 'success'
  }>
}

export function followTopic(params: { groupId: string }) {
  return call(getApiUrl('follow-topic'), 'POST', params)
}

export const searchGroups = curriedAPI('search-groups')

export function leagueActivity(params: { season: number; cohort: string }) {
  return call(getApiUrl('league-activity'), 'POST', params) as Promise<{
    bets: Bet[]
    comments: ContractComment[]
    contracts: Contract[]
  }>
}

export function cancelBounty(params: { contractId: string }) {
  return call(getApiUrl('cancel-bounty'), 'POST', params)
}

export function searchGiphy(params: { term: string; limit: number }) {
  return call(getApiUrl('searchgiphy'), 'POST', params)
}

export function tweetFromManaChan(params: { tweet: string }) {
  return call(getApiUrl('manachantweet'), 'POST', params)
}

export function leaveReview(params: any) {
  return call(getApiUrl('leave-review'), 'POST', params)
}

export function castPollVote(
  params:
    | { contractId: string; voteId: string }
    | { contractId: string; voteIds: string[] }
    | { contractId: string; rankedVoteIds: string[] }
) {
  return call(getApiUrl('cast-poll-vote'), 'POST', params)
}

export function getSimilarGroupsToContract(params: { question: string }) {
  return call(getApiUrl('get-similar-groups-to-contract'), 'POST', params)
}

export function bidForLeague(params: {
  season: number
  division: number
  cohort: string
  amount: number
}) {
  return call(getApiUrl('bidforleague'), 'POST', params)
}

export function followUser(userId: string) {
  return call(getApiUrl('follow-user'), 'POST', { userId, follow: true })
}

export function unfollowUser(userId: string) {
  return call(getApiUrl('follow-user'), 'POST', { userId, follow: false })
}

export function report(params: ReportProps) {
  return call(getApiUrl('report'), 'POST', params)
}

export function createDashboard(params: {
  title: string
  items: DashboardItem[]
  topics: string[]
}) {
  return call(getApiUrl('createdashboard'), 'POST', params)
}

export function getYourDashboards() {
  return call(getApiUrl('getyourdashboards'), 'POST')
}

export function followDashboard(params: { dashboardId: string }) {
  return call(getApiUrl('followdashboard'), 'POST', params)
}

export function supabaseSearchDashboards(params: {
  term: string
  offset: number
  limit: number
}) {
  return call(getApiUrl('supabasesearchdashboards'), 'POST', params) as Promise<
    BaseDashboard[]
  >
}

export function getYourFollowedDashboards() {
  return call(getApiUrl('getyourfolloweddashboards'), 'POST')
}

export function updateDashboard(params: {
  title: string
  dashboardId: string
  items: DashboardItem[]
  topics?: string[]
}) {
  return call(getApiUrl('updatedashboard'), 'POST', params)
}

export function deleteDashboard(params: { dashboardId: string }) {
  return call(getApiUrl('delete-dashboard'), 'POST', params)
}

export const updateMarket = curriedAPI('market/:contractId/update')

export const updateUser = curriedAPI('me/update')

export function banUser(params: {
  userId: string
  unban?: boolean
  unbanTime?: number
  // New granular ban fields
  bans?: {
    posting?: boolean
    marketControl?: boolean
    trading?: boolean
    purchase?: boolean
  }
  unbanTimes?: {
    posting?: number
    marketControl?: number
    trading?: number
    purchase?: number
  }
  reason?: string
  modAlert?: {
    message: string
  }
}) {
  return call(getApiUrl('ban-user'), 'POST', params)
}

export function dismissModAlert() {
  return call(getApiUrl('dismiss-mod-alert'), 'POST', {})
}
export function createPrivateMessageChannelWithUsers(params: {
  userIds: string[]
}) {
  return call(getApiUrl('create-private-user-message-channel'), 'POST', params)
}

export function sendUserPrivateMessage(params: {
  channelId: number
  content: JSONContent
}) {
  return call(getApiUrl('create-private-user-message'), 'POST', params)
}
export function leavePrivateMessageChannel(params: { channelId: number }) {
  return call(getApiUrl('leave-private-user-message-channel'), 'POST', params)
}
export function updatePrivateMessageChannel(params: {
  channelId: number
  notifyAfterTime: number
}) {
  return call(getApiUrl('update-private-user-message-channel'), 'POST', params)
}
export function editAnswerCpmm(params: {
  answerId: string
  text?: string
  color?: string
  contractId: string
}) {
  return call(getApiUrl('edit-answer-cpmm'), 'POST', params)
}

export function createChartAnnotation(params: {
  eventTime: number
  contractId: string
  text?: string
  commentId?: string
  thumbnailUrl?: string
  externalUrl?: string
  answerId?: string
  probChange?: number
}) {
  return call(getApiUrl('create-chart-annotation'), 'POST', params)
}

export function deleteChartAnnotation(params: { id: number }) {
  return call(getApiUrl('delete-chart-annotation'), 'POST', params)
}

export function getAdAnalytics(params: { contractId: string }) {
  return call(getApiUrl('get-ad-analytics'), 'POST', params)
}

export function requestLoan() {
  return call(getApiUrl('request-loan'), 'GET')
}
