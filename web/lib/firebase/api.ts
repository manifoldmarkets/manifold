import { auth } from './users'
import { APIError, getApiUrl } from 'common/api'
import { JSONContent } from '@tiptap/core'
import { QfAnswerReq } from 'web/pages/api/v0/qf/answer'
import { QfPayReq } from 'web/pages/api/v0/qf/pay'
import { QfAddPoolReq } from 'web/pages/api/v0/qf/add-pool'
import { QfResolveReq } from 'web/pages/api/v0/qf/resolve'
import { PrivacyStatusType } from 'common/group'
import { HideCommentReq } from 'web/pages/api/v0/hide-comment'
export { APIError } from 'common/api'

export async function call(url: string, method: string, params?: any) {
  const user = auth.currentUser
  if (user == null) {
    throw new Error('Must be signed in to make API calls.')
  }
  const token = await user.getIdToken()
  const req = new Request(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    method: method,
    body: params != null ? JSON.stringify(params) : undefined,
  })
  return await fetch(req).then(async (resp) => {
    const json = (await resp.json()) as { [k: string]: any }
    if (!resp.ok) {
      throw new APIError(resp.status, json?.message, json?.details)
    }
    return json
  })
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

export function addSubsidy(params: any) {
  return call(getApiUrl('addsubsidy'), 'POST', params)
}

export function createMarket(params: any) {
  return call(getApiUrl('createmarket'), 'POST', params)
}

export function resolveMarket(params: any) {
  return call(getApiUrl('resolvemarket'), 'POST', params)
}

export function swapCert(params: any) {
  return call(getApiUrl('swapcert'), 'POST', params)
}

export function dividendCert(params: any) {
  return call(getApiUrl('dividendcert'), 'POST', params)
}

export function placeBet(params: any) {
  return call(getApiUrl('placebet'), 'POST', params)
}

export function cancelBet(params: { betId: string }) {
  return call(getApiUrl('cancelbet'), 'POST', params)
}

export function sellShares(params: any) {
  return call(getApiUrl('sellshares'), 'POST', params)
}

export function sellBet(params: any) {
  return call(getApiUrl('sellbet'), 'POST', params)
}

export function claimManalink(params: any) {
  return call(getApiUrl('claimmanalink'), 'POST', params)
}

export function createGroup(params: any) {
  return call(getApiUrl('creategroup'), 'POST', params)
}

export function acceptChallenge(params: any) {
  return call(getApiUrl('acceptchallenge'), 'POST', params)
}

export function getCurrentUser(params: any) {
  return call(getApiUrl('getcurrentuser'), 'GET', params)
}

export function createPost(params: {
  title: string
  content: JSONContent
  groupId?: string
  isGroupAboutPost?: boolean
}) {
  return call(getApiUrl('createpost'), 'POST', params)
}

export function redeemAd(params: any) {
  return call(getApiUrl('redeemad'), 'POST', params)
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

export function addContractToGroup(params: {
  groupId: string
  contractId: string
}) {
  return call(getApiUrl('addcontracttogroup'), 'POST', params)
}

export function removeContractFromGroup(params: {
  groupId: string
  contractId: string
}) {
  return call(getApiUrl('removecontractfromgroup'), 'POST', params)
}

export function createQfAnswer(params: QfAnswerReq) {
  return call('/api/v0/qf/answer', 'POST', params)
}

export function payQfAnswer(params: QfPayReq) {
  return call('/api/v0/qf/pay', 'POST', params)
}

export function addQfAddPool(params: QfAddPoolReq) {
  return call('/api/v0/qf/add-pool', 'POST', params)
}

export function resolveQf(params: QfResolveReq) {
  return call('/api/v0/qf/resolve', 'POST', params)
}

export function unresolveMarket(params: { marketId: string }) {
  const { marketId } = params
  return call(`/api/v0/market/${marketId}/unresolve`, 'POST', params)
}

export function hideComment(params: HideCommentReq) {
  return call(`/api/v0/hide-comment`, 'POST', params)
}

export function updateGroupPrivacy(params: {
  groupId: string
  privacy: PrivacyStatusType
}) {
  return call(getApiUrl('updategroupprivacy'), 'POST', params)
}

export function addGroupMember(params: { groupId: string; userId: string }) {
  return call(getApiUrl('addgroupmember'), 'POST', params)
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

export function getPrivateContractBySlug(params: { contractSlug: string }) {
  return call(getApiUrl('getprivatecontractbyslug'), 'POST', params)
}

export function getSupabaseToken() {
  return call(getApiUrl('getsupabasetoken'), 'GET')
}
