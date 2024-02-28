import * as cors from 'cors'
import * as crypto from 'crypto'
import * as express from 'express'
import { ErrorRequestHandler, RequestHandler } from 'express'

import { log, withLogContext } from 'shared/log'
import { APIError, pathWithPrefix } from 'common/api/utils'
import { health } from './health'
import { transact } from './transact'
import { changeuserinfo } from './change-user-info'
import { createuser } from './create-user'
import { createanswer } from './create-answer'
import { placeBet } from './place-bet'
import { cancelBet } from './cancel-bet'
import { sellShareDPM } from './sell-bet'
import { sellShares } from './sell-shares'
import { claimmanalink } from './claim-manalink'
import { createMarket } from './create-market'
import { createComment } from './create-comment'
import { creategroup } from './create-group'
import { resolveMarket } from './resolve-market'
import { closeMarket } from './close-market'
import { unsubscribe } from './unsubscribe'
import { stripewebhook, createcheckoutsession } from './stripe-endpoints'
import { getCurrentUser } from './get-current-user'
import { saveTwitchCredentials } from './save-twitch-credentials'
import { addLiquidity } from './add-subsidy'
import { validateiap } from './validate-iap'
import { markallnotifications } from './mark-all-notifications'
import { updatememberrole } from './update-group-member-role'
import { updategroupprivacy } from './update-group-privacy'
import { addgroupmember } from './add-group-member'
import { registerdiscordid } from './register-discord-id'
import { getuserisgroupmember } from './get-user-is-group-member'
import { completequest } from './complete-quest'
import { getsupabasetoken } from './get-supabase-token'
import { updateUserEmbedding } from './update-user-embedding'
import { deleteMarket } from './delete-market'
import { saveTopic } from './save-topic'
import { getcontractparams } from './get-contract-params'
import { boostmarket } from './boost-market'
import { redeemboost } from './redeem-market-ad-reward'
import { creategroupinvite } from './create-group-invite'
import { followtopic } from './follow-topic'
import { editcomment } from 'api/edit-comment'
import {
  supabasesearchgroups,
  supabasesearchmygroups,
} from './supabase-search-groups'
import { leagueActivity } from './league-activity'
import { updategroup } from './update-group'
import { updateUserDisinterestEmbedding } from 'api/update-user-disinterests'
import { awardBounty } from './award-bounty'
import { addBounty } from './add-bounty'
import { cancelbounty } from './cancel-bounty'
import { createAnswerCPMM } from './create-answer-cpmm'
import { createportfolio } from './create-portfolio'
import { updateportfolio } from './update-portfolio'
import { buyportfolio } from './buy-portfolio'
import { searchgiphy } from './search-giphy'
import { manachantweet } from './manachan-tweet'
import { sendMana } from './send-mana'
import { leavereview } from './leave-review'
import { getusercontractmetricswithcontracts } from './get-user-contract-metrics-with-contracts'
import { castpollvote } from './cast-poll-vote'
import { getsimilargroupstocontract } from 'api/get-similar-groups-to-contract'
import { followUser } from './follow-user'
import { report } from './report'
import { createdashboard } from './create-dashboard'
import { getyourdashboards } from './get-your-dashboards'
import { followdashboard } from './follow-dashboard'
import { supabasesearchdashboards } from './supabase-search-dashboards'
import { getyourfolloweddashboards } from './get-your-followed-dashboards'
import { updatedashboard } from './update-dashboard'
import { deletedashboard } from './delete-dashboard'
import { setnews } from './set-news'
import { getnews } from './get-news'
import { getdashboardfromslug } from './get-dashboard-from-slug'
import { unresolve } from './unresolve'
import { referuser } from 'api/refer-user'
import { banuser } from 'api/ban-user'
import { updateMarket } from 'api/update-market'
import { createprivateusermessage } from 'api/create-private-user-message'
import { createprivateusermessagechannel } from 'api/create-private-user-message-channel'
import { createlover } from 'api/love/create-lover'
import { updatelover } from 'api/love/update-lover'
import { createMatch } from 'api/love/create-match'
import { createcommentonlover } from 'api/love/create-comment-on-lover'
import { hidecommentonlover } from 'api/love/hide-comment-on-lover'
import { rejectLover } from './love/reject-lover'
import { searchlocation } from './search-location'
import { searchnearcity } from './search-near-city'
import { leaveprivateusermessagechannel } from 'api/leave-private-user-message-channel'
import { updateprivateusermessagechannel } from 'api/update-private-user-message-channel'
import { confirmLoverStage } from './love/confirm-lover-stage'
import { editanswercpmm } from 'api/edit-answer'
import { createlovecompatibilityquestion } from 'api/love/create-love-compatibility-question'
import { getCompatibleLovers } from './love/compatible-lovers'
import { API, type APIPath } from 'common/api/schema'
import { getMarkets } from 'api/markets'
import { createchartannotation } from 'api/create-chart-annotation'
import { deletechartannotation } from 'api/delete-chart-annotation'
import { assertUnreachable } from 'common/util/types'
import { hideComment } from './hide-comment'
import { pinComment } from './pin-comment'
import { getManagrams } from './get-managrams'
import { getGroups } from './get-groups'
import { getComments } from './get-comments'
import { getBets } from './get-bets'
import { getUser } from './get-user'
import { getUsers } from './get-users'
import { getMarket } from './get-market'
import { getGroup } from './get-group'
import { getPositions } from './get-positions'
import { getLeagues } from './get-leagues'
import { addOrRemoveGroupFromContract } from './update-tag'
import { searchUsers } from './supabase-search-users'
import {
  searchMarketsLite,
  searchMarketsFull,
} from './supabase-search-contract'
import { post } from 'api/post'
import { fetchLinkPreview } from './fetch-link-preview'
import { type APIHandler, typedEndpoint } from './helpers/endpoint'
import { requestloan } from 'api/request-loan'
import { removePinnedPhoto } from './love/remove-pinned-photo'
import { getHeadlines, getPoliticsHeadlines } from './get-headlines'
import { getrelatedmarkets } from 'api/get-related-markets'
import { getadanalytics } from 'api/get-ad-analytics'
import { getCompatibilityQuestions } from './love/get-compatibililty-questions'
import { addOrRemoveReaction } from './reaction'
import { likeLover } from './love/like-lover'
import { shipLovers } from './love/ship-lovers'
import { createManalink } from './create-manalink'
import { requestSignupBonus } from 'api/request-signup-bonus'
import { getLikesAndShips } from './love/get-likes-and-ships'
import { hasFreeLike } from './love/has-free-like'
import { starLover } from './love/star-lover'
import { getLovers } from './love/get-lovers'
import { unlistAndCancelUserContracts } from './unlist-and-cancel-user-contracts'
import { getGroupsWithTopContracts } from 'api/get-topics-with-markets'
import { getBalanceChanges } from 'api/get-balance-changes'
import { getLoverAnswers } from './love/get-lover-answers'
import { createYourLoveMarket } from './love/create-your-love-market'
import { getLoveMarket } from './love/get-love-market'
import { getLoveMarkets } from './love/get-love-markets'
import { getPartnerStats } from './get-partner-stats'
import { getSeenMarketIds } from 'api/get-seen-market-ids'

const allowCorsUnrestricted: RequestHandler = cors({})

function cacheController(policy?: string): RequestHandler {
  return (_req, res, next) => {
    if (policy) res.appendHeader('Cache-Control', policy)
    next()
  }
}

const requestContext: RequestHandler = (req, _res, next) => {
  const traceContext = req.get('X-Cloud-Trace-Context')
  const traceId = traceContext
    ? traceContext.split('/')[0]
    : crypto.randomUUID()
  const context = { endpoint: req.path, traceId }
  withLogContext(context, () => {
    log(`${req.method} ${req.url}`)
    next()
  })
}

const apiErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (error instanceof APIError) {
    log.info(error)
    if (!res.headersSent) {
      const output: { [k: string]: unknown } = { message: error.message }
      if (error.details != null) {
        output.details = error.details
      }
      res.status(error.code).json(output)
    }
  } else {
    log.error(error)
    if (!res.headersSent) {
      res.status(500).json({ message: error.stack, error })
    }
  }
}

const apiRoute = (endpoint: RequestHandler) => {
  return [
    allowCorsUnrestricted,
    express.json(),
    endpoint,
    apiErrorHandler,
  ] as const
}

export const app = express()
app.use(requestContext)

app.options('*', allowCorsUnrestricted)

// we define the handlers in this object in order to typecheck that every API has a handler
const handlers: { [k in APIPath]: APIHandler<k> } = {
  bet: placeBet,
  'bet/cancel/:betId': cancelBet,
  'sell-shares-dpm': sellShareDPM,
  'market/:contractId/sell': sellShares,
  bets: getBets,
  comment: createComment,
  'hide-comment': hideComment,
  'pin-comment': pinComment,
  comments: getComments,
  market: createMarket,
  'update-market': (...props) => updateMarket(...props), // @deprecated remove after a few days
  'market/:contractId/group': addOrRemoveGroupFromContract,
  'group/:slug': getGroup,
  'group/by-id/:id': getGroup,
  'group/by-id/:id/markets': ({ id, limit }, ...rest) =>
    getMarkets({ groupId: id, limit }, ...rest),
  groups: getGroups,
  'market/:id': getMarket,
  'market/:id/lite': ({ id }) => getMarket({ id, lite: true }),
  'slug/:slug': getMarket,
  'market/:contractId/update': updateMarket,
  'market/:contractId/close': closeMarket,
  'market/:contractId/resolve': resolveMarket,
  'market/:contractId/add-liquidity': addLiquidity,
  'market/:contractId/add-bounty': addBounty,
  'market/:contractId/award-bounty': awardBounty,
  'market/:contractId/answer': createAnswerCPMM,
  leagues: getLeagues,
  markets: getMarkets,
  'search-markets': searchMarketsLite,
  'search-markets-full': searchMarketsFull,
  managram: sendMana,
  managrams: getManagrams,
  manalink: createManalink,
  'market/:id/positions': getPositions,
  me: getCurrentUser,
  'user/:username': getUser,
  'user/:username/bets': (...props) => getBets(...props),
  'user/by-id/:id': getUser,
  users: getUsers,
  'search-users': searchUsers,
  react: addOrRemoveReaction,
  'save-twitch': saveTwitchCredentials,
  headlines: getHeadlines,
  'politics-headlines': getPoliticsHeadlines,
  'compatible-lovers': getCompatibleLovers,
  post: post,
  'fetch-link-preview': fetchLinkPreview,
  'request-loan': requestloan,
  'remove-pinned-photo': removePinnedPhoto,
  'get-related-markets': getrelatedmarkets,
  'unlist-and-cancel-user-contracts': unlistAndCancelUserContracts,
  'get-ad-analytics': getadanalytics,
  'get-compatibility-questions': getCompatibilityQuestions,
  'like-lover': likeLover,
  'ship-lovers': shipLovers,
  'request-signup-bonus': requestSignupBonus,
  'get-likes-and-ships': getLikesAndShips,
  'has-free-like': hasFreeLike,
  'star-lover': starLover,
  'get-lovers': getLovers,
  'get-lover-answers': getLoverAnswers,
  'set-news': setnews,
  'update-user-embedding': updateUserEmbedding,
  'search-groups': supabasesearchgroups,
  'search-my-groups': supabasesearchmygroups,
  'get-groups-with-top-contracts': getGroupsWithTopContracts,
  'get-balance-changes': getBalanceChanges,
  'create-your-love-market': createYourLoveMarket,
  'get-love-market': getLoveMarket,
  'get-love-markets': getLoveMarkets,
  'get-partner-stats': getPartnerStats,
  'get-seen-market-ids': getSeenMarketIds,
}

Object.entries(handlers).forEach(([path, handler]) => {
  const api = API[path as APIPath]
  const cache = cacheController((api as any).cache)
  const url = '/' + pathWithPrefix(path as APIPath)

  const apiRoute = [
    url,
    express.json(),
    allowCorsUnrestricted,
    cache,
    typedEndpoint(path as any, handler as any),
    apiErrorHandler,
  ] as const

  if (api.method === 'POST') {
    app.post(...apiRoute)
  } else if (api.method === 'GET') {
    app.get(...apiRoute)
    // } else if (api.method === 'PUT') {
    //   app.put(...apiRoute)
  } else {
    assertUnreachable(api, 'Unsupported API method')
  }
})

app.get('/health', ...apiRoute(health))
app.get('/unsubscribe', ...apiRoute(unsubscribe))
app.post('/transact', ...apiRoute(transact))
app.post('/changeuserinfo', ...apiRoute(changeuserinfo))
app.post('/createuser', ...apiRoute(createuser))
app.post('/createanswer', ...apiRoute(createanswer))
app.post('/editcomment', ...apiRoute(editcomment))

app.post('/claimmanalink', ...apiRoute(claimmanalink))
app.post('/creategroup', ...apiRoute(creategroup))
app.post('/updategroup', ...apiRoute(updategroup))
app.post('/validateIap', ...apiRoute(validateiap))
app.post('/markallnotifications', ...apiRoute(markallnotifications))
app.post('/updatememberrole', ...apiRoute(updatememberrole))
app.post('/updategroupprivacy', ...apiRoute(updategroupprivacy))
app.post('/registerdiscordid', ...apiRoute(registerdiscordid))
app.post('/addgroupmember', ...apiRoute(addgroupmember))
app.post('/getuserisgroupmember', ...apiRoute(getuserisgroupmember))
app.post('/completequest', ...apiRoute(completequest))
app.post(
  '/update-user-disinterest-embedding',
  ...apiRoute(updateUserDisinterestEmbedding)
)
app.get('/getsupabasetoken', ...apiRoute(getsupabasetoken))
app.post('/delete-market', ...apiRoute(deleteMarket))
app.post('/save-topic', ...apiRoute(saveTopic))
app.post('/boost-market', ...apiRoute(boostmarket))
app.post('/redeem-boost', ...apiRoute(redeemboost))

app.post('/createcheckoutsession', allowCorsUnrestricted, createcheckoutsession)
app.post(
  '/stripewebhook',
  allowCorsUnrestricted,
  express.raw({ type: '*/*' }),
  stripewebhook
)
app.post('/getcontractparams', ...apiRoute(getcontractparams))
app.post('/creategroupinvite', ...apiRoute(creategroupinvite))
app.post('/follow-topic', ...apiRoute(followtopic))
app.post('/league-activity', ...apiRoute(leagueActivity))
app.post('/cancel-bounty', ...apiRoute(cancelbounty))
app.post('/edit-answer-cpmm', ...apiRoute(editanswercpmm))
app.post('/createportfolio', ...apiRoute(createportfolio))
app.post('/updateportfolio', ...apiRoute(updateportfolio))
app.post('/buyportfolio', ...apiRoute(buyportfolio))
app.post('/searchgiphy', ...apiRoute(searchgiphy))
app.post('/manachantweet', ...apiRoute(manachantweet))
app.post('/refer-user', ...apiRoute(referuser))
app.post('/leave-review', ...apiRoute(leavereview))
app.post(
  '/get-user-contract-metrics-with-contracts',
  ...apiRoute(getusercontractmetricswithcontracts)
)
app.post('/cast-poll-vote', ...apiRoute(castpollvote))
app.post(
  '/get-similar-groups-to-contract',
  ...apiRoute(getsimilargroupstocontract)
)
app.post('/follow-user', ...apiRoute(followUser))
app.post('/report', ...apiRoute(report))
app.post('/unresolve', ...apiRoute(unresolve))

app.post('/createdashboard', ...apiRoute(createdashboard))
app.post('/getyourdashboards', ...apiRoute(getyourdashboards))
app.post('/followdashboard', ...apiRoute(followdashboard))
app.post('/supabasesearchdashboards', ...apiRoute(supabasesearchdashboards))
app.post('/getyourfolloweddashboards', ...apiRoute(getyourfolloweddashboards))
app.post('/updatedashboard', ...apiRoute(updatedashboard))
app.post('/delete-dashboard', ...apiRoute(deletedashboard))
app.get('/get-news-dashboards', ...apiRoute(getnews))
app.post('/getdashboardfromslug', ...apiRoute(getdashboardfromslug))
app.post('/ban-user', ...apiRoute(banuser))
app.post('/create-private-user-message', ...apiRoute(createprivateusermessage))
app.post(
  '/create-private-user-message-channel',
  ...apiRoute(createprivateusermessagechannel)
)
app.post(
  '/leave-private-user-message-channel',
  ...apiRoute(leaveprivateusermessagechannel)
)
app.post(
  '/update-private-user-message-channel',
  ...apiRoute(updateprivateusermessagechannel)
)
app.post('/create-lover', ...apiRoute(createlover))
app.post('/update-lover', ...apiRoute(updatelover))
app.post('/reject-lover', ...apiRoute(rejectLover))
app.post('/confirm-lover-stage', ...apiRoute(confirmLoverStage))
app.post('/create-match', ...apiRoute(createMatch))
app.post('/create-comment-on-lover', ...apiRoute(createcommentonlover))
app.post('/hide-comment-on-lover', ...apiRoute(hidecommentonlover))
app.post('/searchlocation', ...apiRoute(searchlocation))
app.post('/searchnearcity', ...apiRoute(searchnearcity))
app.post(
  '/createlovecompatibilityquestion',
  ...apiRoute(createlovecompatibilityquestion)
)
app.post('/create-chart-annotation', ...apiRoute(createchartannotation))
app.post('/delete-chart-annotation', ...apiRoute(deletechartannotation))
// Catch 404 errors - this should be the last route
app.use(allowCorsUnrestricted, (req, res) => {
  res
    .status(404)
    .set('Content-Type', 'application/json')
    .json({
      message: `The requested route '${req.path}' does not exist. Please check your URL for any misspellings or refer to app.ts`,
    })
})
