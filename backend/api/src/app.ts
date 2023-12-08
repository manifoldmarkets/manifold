import * as cors from 'cors'
import * as express from 'express'
import { ErrorRequestHandler, RequestHandler } from 'express'
import {
  CORS_ORIGIN_MANIFOLD,
  CORS_ORIGIN_LOCALHOST,
  CORS_ORIGIN_VERCEL,
  CORS_ORIGIN_MANIFOLD_LOVE,
  CORS_ORIGIN_MANIFOLD_LOVE_ALTERNATE,
  CORS_ORIGIN_CHARITY,
} from 'common/envs/constants'
import { log } from 'shared/utils'
import { APIError, pathWithPrefix } from 'common/api/utils'
import { health } from './health'
import { transact } from './transact'
import { changeuserinfo } from './change-user-info'
import { createuser } from './create-user'
import { createanswer } from './create-answer'
import { placeBet } from './place-bet'
import { cancelBet } from './cancel-bet'
import { sellBet } from './sell-bet'
import { sellshares } from './sell-shares'
import { claimmanalink } from './claim-manalink'
import { createMarket } from './create-market'
import { createComment } from './create-comment'
import { creategroup } from './create-group'
import { resolveMarket } from './resolve-market'
import { closeMarket } from './close-market'
import { unsubscribe } from './unsubscribe'
import { stripewebhook, createcheckoutsession } from './stripe-endpoints'
import { getCurrentUser } from './get-current-user'
import { createpost } from './create-post'
import { saveTwitchCredentials } from './save-twitch-credentials'
import { addLiquidity } from './add-subsidy'
import { validateiap } from './validate-iap'
import { swapcert } from './swap-cert'
import { dividendcert } from './dividend-cert'
import { markallnotifications } from './mark-all-notifications'
import { addcontracttogroup } from './add-contract-to-group'
import { updatememberrole } from './update-group-member-role'
import { removecontractfromgroup } from './remove-contract-from-group'
import { updategroupprivacy } from './update-group-privacy'
import { addgroupmember } from './add-group-member'
import { registerdiscordid } from './register-discord-id'
import { getuserisgroupmember } from './get-user-is-group-member'
import { completequest } from './complete-quest'
import { getsupabasetoken } from './get-supabase-token'
import { updateUserEmbedding } from './update-user-embedding'
import { supabasesearchcontracts } from './supabase-search-contract'
import { deleteMarket } from './delete-market'
import { saveTopic } from './save-topic'
import { getcontractparams } from './get-contract-params'
import { boostmarket } from './boost-market'
import { redeemboost } from './redeem-market-ad-reward'
import { creategroupinvite } from './create-group-invite'
import { followtopic } from './follow-topic'
import { editcomment } from 'api/edit-comment'
import { supabasesearchgroups } from './supabase-search-groups'
import { leagueActivity } from './league-activity'
import { updatepost } from './update-post'
import { updategroup } from './update-group'
import { updateUserDisinterestEmbedding } from 'api/update-user-disinterests'
import { awardBounty } from './award-bounty'
import { addBounty } from './add-bounty'
import { cancelbounty } from './cancel-bounty'
import { createanswercpmm } from './create-answer-cpmm'
import { createportfolio } from './create-portfolio'
import { updateportfolio } from './update-portfolio'
import { buyportfolio } from './buy-portfolio'
import { searchgiphy } from './search-giphy'
import { manachantweet } from './manachan-tweet'
import { sendMana } from './send-mana'
import { leavereview } from './leave-review'
import { getusercontractmetricswithcontracts } from './get-user-contract-metrics-with-contracts'
import { claimdestinysub } from './claim-destiny-sub'
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
import { updatemarket } from 'api/update-market'
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
import { clearLoverPhoto } from './love/clear-lover-photo'
import { editanswercpmm } from 'api/edit-answer'
import { createlovecompatibilityquestion } from 'api/love/create-love-compatibility-question'
import { oncreatebet } from 'api/on-create-bet'
import { getCompatibleLovers } from './love/compatible-lovers'
import { API, type APIPath } from 'common/api/schema'
import { markets } from 'api/markets'
import { createchartannotation } from 'api/create-chart-annotation'
import { deletechartannotation } from 'api/delete-chart-annotation'
import { assertUnreachable } from 'common/util/types'
import { hideComment } from './hide-comment'
import { getManagrams } from './get-managrams'
import { getGroups } from './get-groups'
import { getComments } from './get-comments'
import { getBets } from './get-bets'
import { getUser } from './get-user'
import { getUsers } from './get-users'

const allowCorsUnrestricted: RequestHandler = cors({})
const allowCorsManifold: RequestHandler = cors({
  origin: [
    CORS_ORIGIN_MANIFOLD,
    CORS_ORIGIN_MANIFOLD_LOVE,
    CORS_ORIGIN_MANIFOLD_LOVE_ALTERNATE,
    CORS_ORIGIN_CHARITY,
    CORS_ORIGIN_VERCEL,
    CORS_ORIGIN_LOCALHOST,
  ],
})

const requestLogger: RequestHandler = (req, _res, next) => {
  log(`${req.method} ${req.url} ${JSON.stringify(req.body ?? '')}`)
  next()
}

const apiErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    return next(err)
  }
  if (err instanceof APIError) {
    const output: { [k: string]: unknown } = { message: err.message }
    if (err.details != null) {
      output.details = err.details
    }
    res.status(err.code).json(output)
  } else {
    console.error(err.stack)
    res.status(500).json({ message: `An unknown error occurred: ${err.stack}` })
  }
}

const apiRoute = (endpoint: RequestHandler) => {
  return [allowCorsManifold, express.json(), endpoint, apiErrorHandler] as const
}

export const app = express()
app.use(requestLogger)

// internal APIs
app.options('*', allowCorsManifold)

// v0 public API routes
app.options('/v0', allowCorsUnrestricted)

// we define the handlers in this object in order to typecheck that every API has a handler
const handlers: { [k in APIPath]: RequestHandler } = {
  bet: placeBet,
  'cancel-bet': cancelBet,
  'sell-bet': sellBet,
  bets: getBets,
  comment: createComment,
  'hide-comment': hideComment,
  comments: getComments,
  'create-market': createMarket,
  groups: getGroups,
  close: closeMarket,
  resolve: resolveMarket,
  'add-liquidity': addLiquidity,
  'add-bounty': addBounty,
  'award-bounty': awardBounty,
  markets: markets,
  'send-mana': sendMana,
  managrams: getManagrams,
  me: getCurrentUser,
  user: getUser,
  users: getUsers,
  'save-twitch': saveTwitchCredentials,
  'compatible-lovers': getCompatibleLovers,
}

Object.entries(handlers).forEach(([path, handler]) => {
  const api = API[path as APIPath]
  const cors =
    api.visibility === 'public' ? allowCorsUnrestricted : allowCorsManifold

  const apiRoute = [
    '/' + pathWithPrefix(path as APIPath),
    express.json(),
    cors,
    handler,
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
app.post('/createcomment', ...apiRoute(createComment))
app.post('/editcomment', ...apiRoute(editcomment))
app.post('/swapcert', ...apiRoute(swapcert))
app.post('/dividendcert', ...apiRoute(dividendcert))
app.post('/placebet', ...apiRoute(placeBet))
app.post('/cancelbet', ...apiRoute(cancelBet))
app.post('/sellbet', ...apiRoute(sellBet))
app.post('/sellshares', ...apiRoute(sellshares))
app.post('/addsubsidy', ...apiRoute(addLiquidity))
app.post('/claimmanalink', ...apiRoute(claimmanalink))
app.post('/createmarket', ...apiRoute(createMarket))
app.post('/creategroup', ...apiRoute(creategroup))
app.post('/updategroup', ...apiRoute(updategroup))
app.post('/resolvemarket', ...apiRoute(resolveMarket))
app.post('/closemarket', ...apiRoute(closeMarket))
app.post('/createpost', ...apiRoute(createpost))
app.post('/updatepost', ...apiRoute(updatepost))
app.post('/validateIap', ...apiRoute(validateiap))
app.post('/markallnotifications', ...apiRoute(markallnotifications))
app.post('/updatememberrole', ...apiRoute(updatememberrole))
app.post('/updategroupprivacy', ...apiRoute(updategroupprivacy))
app.post('/registerdiscordid', ...apiRoute(registerdiscordid))
app.post('/addcontracttogroup', ...apiRoute(addcontracttogroup))
app.post('/removecontractfromgroup', ...apiRoute(removecontractfromgroup))
app.post('/addgroupmember', ...apiRoute(addgroupmember))
app.post('/getuserisgroupmember', ...apiRoute(getuserisgroupmember))
app.post('/completequest', ...apiRoute(completequest))
app.post('/update-user-embedding', ...apiRoute(updateUserEmbedding))
app.post(
  '/update-user-disinterest-embedding',
  ...apiRoute(updateUserDisinterestEmbedding)
)
app.get('/getsupabasetoken', ...apiRoute(getsupabasetoken))
app.post('/supabasesearchcontracts', ...apiRoute(supabasesearchcontracts))
app.post('/delete-market', ...apiRoute(deleteMarket))
app.post('/save-topic', ...apiRoute(saveTopic))
app.post('/boost-market', ...apiRoute(boostmarket))
app.post('/redeem-boost', ...apiRoute(redeemboost))

app.post('/createcheckoutsession', allowCorsManifold, createcheckoutsession)
app.post(
  '/stripewebhook',
  allowCorsManifold,
  express.raw({ type: '*/*' }),
  stripewebhook
)
app.post('/getcontractparams', ...apiRoute(getcontractparams))
app.post('/creategroupinvite', ...apiRoute(creategroupinvite))
app.post('/follow-topic', ...apiRoute(followtopic))
app.post('/supabasesearchgroups', ...apiRoute(supabasesearchgroups))
app.post('/league-activity', ...apiRoute(leagueActivity))
app.post('/cancel-bounty', ...apiRoute(cancelbounty))
app.post('/createanswercpmm', ...apiRoute(createanswercpmm))
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
app.post('/claimdestinysub', ...apiRoute(claimdestinysub))
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
app.post('/set-news-dashboards', ...apiRoute(setnews))
app.get('/get-news-dashboards', ...apiRoute(getnews))
app.post('/getdashboardfromslug', ...apiRoute(getdashboardfromslug))
app.post('/ban-user', ...apiRoute(banuser))
app.post('/update-market', ...apiRoute(updatemarket))
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
app.post('/clear-lover-photo', ...apiRoute(clearLoverPhoto))
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

const publicApiRoute = (endpoint: RequestHandler) => {
  return [
    allowCorsUnrestricted,
    express.json(),
    endpoint,
    apiErrorHandler,
  ] as const
}

// Ian: not sure how to restrict triggers to supabase origin, yet
app.post('/on-create-bet', ...publicApiRoute(oncreatebet))

// Catch 404 errors - this should be the last route
app.use(allowCorsUnrestricted, (req, res) => {
  res
    .status(404)
    .set('Content-Type', 'application/json')
    .json({
      message: `The requested route '${req.path}' does not exist. Please check your URL for any misspellings or refer to app.ts`,
    })
})
