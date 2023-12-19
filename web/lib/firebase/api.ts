import { auth } from './users'
import { APIError, getApiUrl } from 'common/api/utils'
import { JSONContent } from '@tiptap/core'
import { Group, PrivacyStatusType } from 'common/group'
import { Contract } from './contracts'
import { ContractTypeType, Filter, Sort } from 'web/components/supabase-search'
import { AD_RATE_LIMIT } from 'common/boost'
import { ContractComment } from 'common/comment'
import { MaybeAuthedContractParams, SortType } from 'common/contract'
import { Portfolio, PortfolioItem } from 'common/portfolio'
import { ReportProps } from 'common/report'
import { BaseDashboard, Dashboard, DashboardItem } from 'common/dashboard'
import { Bet } from 'common/bet'
import { API, APIPath, APIParams, APIResponse } from 'common/api/schema'
import { forEach } from 'lodash'
import { removeUndefinedProps } from 'common/util/object'
import { cache } from 'react'

export { APIError } from 'common/api/utils'

export function appendQuery(url: string, props: Record<string, any>) {
  const [base, query] = url.split(/\?(.+)/)
  const params = new URLSearchParams(query)
  forEach(removeUndefinedProps(props ?? {}), (v, k) => params.set(k, v))
  return `${base}?${params.toString()}`
}

export async function call(
  url: string,
  method: 'POST' | 'PUT' | 'GET',
  params?: any
) {
  // const user = auth.currentUser
  // if (user == null) {
  //   throw new Error('Must be signed in to make API calls.')
  // }
  return maybeAuthedCall(url, method, params)
}

export async function maybeAuthedCall(
  url: string,
  method: 'POST' | 'PUT' | 'GET',
  params?: any
) {
  const actualUrl = method === 'POST' ? url : appendQuery(url, params)
  const user = auth.currentUser
  const token = await user?.getIdToken()
  const req = new Request(actualUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    method: method,
    body:
      params == null || method == 'GET' ? undefined : JSON.stringify(params),
  })
  return await fetch(req).then(async (resp) => {
    const json = (await resp.json()) as { [k: string]: any }
    if (!resp.ok) {
      throw new APIError(resp.status as any, json?.message, json?.details)
    }
    return json
  })
}

// TODO: use this for all calls
export function api<P extends APIPath>(path: P, params: APIParams<P>) {
  const { method } = API[path]
  // parse any params that should part of the path (like market/:id)
  let url = getApiUrl(path)
  forEach(params, (v, k) => {
    url = url.replace(`:${k}`, v + '')
  })

  return call(url, method, params) as Promise<APIResponse<P>>
}

export function lootbox() {
  return call(getApiUrl('lootbox'), 'POST')
}

export function createAnswer(params: any) {
  return call(getApiUrl('createanswer'), 'POST', params)
}

export function claimDestinySub(params: any) {
  return call(getApiUrl('claimdestinysub'), 'POST', params)
}

export function transact(params: any) {
  return call(getApiUrl('transact'), 'POST', params)
}

export function createUser(params: any) {
  return call(getApiUrl('createuser'), 'POST', params)
}

export function changeUserInfo(params: any) {
  return call(getApiUrl('changeuserinfo'), 'POST', params)
}

export function swapCert(params: any) {
  return call(getApiUrl('swapcert'), 'POST', params)
}

export function dividendCert(params: any) {
  return call(getApiUrl('dividendcert'), 'POST', params)
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

export function acceptChallenge(params: any) {
  return call(getApiUrl('acceptchallenge'), 'POST', params)
}

export function boostMarket(params: any) {
  return call(getApiUrl('boost-market'), 'POST', params)
}

let nonce = 0
export function redeemBoost(params: any) {
  const now = Date.now()
  if (now - nonce < AD_RATE_LIMIT - 500) {
    throw Error(
      `Please wait ${AD_RATE_LIMIT / 1000} seconds between redeeming boosts.`
    )
  }
  nonce = now
  return call(getApiUrl('redeem-boost'), 'POST', params)
}

export function validateIapReceipt(params: any) {
  return call(getApiUrl('validateiap'), 'POST', params)
}

export function markAllNotifications(params: any) {
  return call(getApiUrl('markallnotifications'), 'POST', params)
}

export function updateMemberRole(params: {
  groupId: string
  memberId: string
  role: string
}) {
  return call(getApiUrl('updatememberrole'), 'POST', params)
}

export function unresolveMarket(params: { contractId: string }) {
  return call(getApiUrl('unresolve'), 'POST', params)
}

export function updateGroupPrivacy(params: {
  groupId: string
  privacy: PrivacyStatusType
}) {
  return call(getApiUrl('updategroupprivacy'), 'POST', params)
}

export function registerDiscordId(params: any) {
  return call(getApiUrl('registerdiscordid'), 'POST', params)
}

export function getUserIsGroupMember(params: { groupSlug: string }) {
  return call(getApiUrl('getuserisgroupmember'), 'POST', params)
}

export function completeQuest(params: any) {
  return call(getApiUrl('completequest'), 'POST', params)
}

export function getSupabaseToken() {
  return call(getApiUrl('getsupabasetoken'), 'GET')
}

export function updateUserEmbedding() {
  return call(getApiUrl('update-user-embedding'), 'POST')
}
export function updateUserDisinterestEmbedding(params: {
  contractId: string
  creatorId: string
  feedId?: number
  removeContract?: boolean
}) {
  return call(getApiUrl('update-user-disinterest-embedding'), 'POST', params)
}

export function searchContracts(params: {
  term: string
  filter?: Filter
  sort?: Sort
  contractType?: ContractTypeType
  offset?: number
  limit?: number
  fuzzy?: boolean
  topicSlug?: string
  creatorId?: string
}) {
  return api('search-markets-full', params)
}

export function deleteMarket(params: { contractId: string }) {
  return call(getApiUrl('delete-market'), 'POST', params) as Promise<{
    status: 'success'
  }>
}

export function saveTopic(params: { topic: string }) {
  return call(getApiUrl('save-topic'), 'POST', params) as Promise<{
    status: 'success'
  }>
}

export function getContractParams(params: { contractSlug: string }) {
  return maybeAuthedCall(
    getApiUrl('getcontractparams'),
    'POST',
    params
  ) as Promise<MaybeAuthedContractParams>
}

export function createGroupInvite(params: {
  groupId: string
  maxUses?: number
  duration?: string
}) {
  return call(getApiUrl('creategroupinvite'), 'POST', params)
}

export function joinGroupThroughInvite(params: { inviteId: string }) {
  return call(getApiUrl('joingroupthroughinvite'), 'POST', params)
}

export function followTopic(params: { groupId: string }) {
  return call(getApiUrl('follow-topic'), 'POST', params)
}

export function searchGroups(params: {
  term: string
  limit: number
  offset?: number
  addingToContract?: boolean
}) {
  return maybeAuthedCall(
    getApiUrl('supabasesearchgroups'),
    'POST',
    params
  ) as Promise<Group[]>
}

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

export function createPortfolio(params: {
  name: string
  items: PortfolioItem[]
}) {
  return call(getApiUrl('createportfolio'), 'POST', params)
}

export function updatePortfolio(params: { id: string } & Partial<Portfolio>) {
  return call(getApiUrl('updateportfolio'), 'POST', params)
}

export function buyPortfolio(
  params: {
    portfolioId: string
    amount: number
    buyOpposite?: boolean
  } & Partial<Portfolio>
) {
  return call(getApiUrl('buyportfolio'), 'POST', params)
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
export function getUserContractsMetricsWithContracts(params: {
  userId: string
  offset: number
  limit: number
}) {
  return maybeAuthedCall(
    getApiUrl('get-user-contract-metrics-with-contracts'),
    'POST',
    params
  )
}

export function castPollVote(params: { contractId: string; voteId: string }) {
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
  return maybeAuthedCall(
    getApiUrl('supabasesearchdashboards'),
    'POST',
    params
  ) as Promise<BaseDashboard[]>
}

export function getNewsDashboards() {
  return maybeAuthedCall(getApiUrl('get-news-dashboards'), 'GET')
}

export function setNewsDashboards(params: { dashboardIds: string[] }) {
  return call(getApiUrl('set-news-dashboards'), 'POST', params)
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

export const getDashboardFromSlug = cache(
  (params: { dashboardSlug: string }) => {
    return maybeAuthedCall(
      getApiUrl('getdashboardfromslug'),
      'POST',
      params
    ) as Promise<Dashboard>
  }
)

export function referUser(params: {
  referredByUsername: string
  contractId?: string
}) {
  return call(getApiUrl('refer-user'), 'POST', params)
}

export function updateMarket(params: {
  contractId: string
  visibility?: 'public' | 'unlisted'
  closeTime?: number
  addAnswersMode?: 'ONLY_CREATOR' | 'ANYONE'
  sort?: SortType
}) {
  return call(getApiUrl('update-market'), 'POST', params)
}

export function banUser(params: { userId: string; unban?: boolean }) {
  return call(getApiUrl('ban-user'), 'POST', params)
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
  text: string
  contractId: string
}) {
  return call(getApiUrl('edit-answer-cpmm'), 'POST', params)
}

export function searchLocation(params: { term: string; limit?: number }) {
  return maybeAuthedCall(getApiUrl('searchlocation'), 'POST', params)
}

export function searchNearCity(params: { cityId: string; radius: number }) {
  if (params.radius < 1 || params.radius > 500) {
    throw new Error('Your radius is out of bounds!')
  }
  return maybeAuthedCall(getApiUrl('searchnearcity'), 'POST', params)
}

// vercel api

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
