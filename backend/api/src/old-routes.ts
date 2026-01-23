import * as express from 'express'
import { health } from './health'
import { claimmanalink } from './claim-manalink'
import { creategroup } from './create-group'
import { unsubscribe } from './unsubscribe'
import { stripewebhook, createcheckoutsession } from './stripe-endpoints'
import { markallnotifications } from './mark-all-notifications'
import { updatememberrole } from './update-group-member-role'
import { updategroupprivacy } from './update-group-privacy'
import { registerdiscordid } from './register-discord-id'
import { getuserisgroupmember } from './get-user-is-group-member'
import { completequest } from './complete-quest'
import { getsupabasetoken } from './get-supabase-token'
import { deleteMarket } from './delete-market'
import { saveTopic } from './save-topic'
import { boostmarket } from './boost-market'
import { redeemboost } from './redeem-market-ad-reward'
import { followtopic } from './follow-topic'
import { editcomment } from 'api/edit-comment'
import { leagueActivity } from './league-activity'
import { updategroup } from './update-group'
import { updateUserDisinterestEmbedding } from 'api/update-user-disinterests'
import { cancelbounty } from './cancel-bounty'
import { searchgiphy } from './search-giphy'
import { manachantweet } from './manachan-tweet'
import { leavereview } from './leave-review'
import { castpollvote } from './cast-poll-vote'
import { getsimilargroupstocontract } from 'api/get-similar-groups-to-contract'
import { followUser } from './follow-user'
import { report } from './report'
import { createdashboard } from './create-dashboard'
import { getyourdashboards } from './get-your-dashboards'
import { followdashboard } from './follow-dashboard'
import { searchDashboards } from './search-dashboards'
import { getyourfolloweddashboards } from './get-your-followed-dashboards'
import { updatedashboard } from './update-dashboard'
import { deletedashboard } from './delete-dashboard'
import { getnews } from './get-news'
import { getdashboardfromslug } from './get-dashboard-from-slug'
import { banuser } from 'api/ban-user'
import { createprivateusermessage } from 'api/create-private-user-message'
import { createprivateusermessagechannel } from 'api/create-private-user-message-channel'
import { leaveprivateusermessagechannel } from 'api/leave-private-user-message-channel'
import { updateprivateusermessagechannel } from 'api/update-private-user-message-channel'
import { editanswercpmm } from 'api/edit-answer'
import { createchartannotation } from 'api/create-chart-annotation'
import { deletechartannotation } from 'api/delete-chart-annotation'

import { deletetv, settv } from './set-tv'
import { idenfyCallback } from './idenfy/callback'

import { allowCorsUnrestricted, apiErrorHandler } from './app'
import { RequestHandler } from 'express'

const apiRoute = (endpoint: RequestHandler) => {
  return [
    allowCorsUnrestricted,
    express.json(),
    endpoint,
    apiErrorHandler,
  ] as const
}

export const addOldRoutes = (app: express.Application) => {
  app.get('/health', ...apiRoute(health))
  app.get('/unsubscribe', ...apiRoute(unsubscribe))
  app.post('/editcomment', ...apiRoute(editcomment))

  app.post('/claimmanalink', ...apiRoute(claimmanalink))
  app.post('/creategroup', ...apiRoute(creategroup))
  app.post('/updategroup', ...apiRoute(updategroup))
  app.post('/markallnotifications', ...apiRoute(markallnotifications))
  app.post('/updatememberrole', ...apiRoute(updatememberrole))
  app.post('/updategroupprivacy', ...apiRoute(updategroupprivacy))
  app.post('/registerdiscordid', ...apiRoute(registerdiscordid))
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

  app.post(
    '/createcheckoutsession',
    allowCorsUnrestricted,
    createcheckoutsession
  )
  app.post(
    '/stripewebhook',
    allowCorsUnrestricted,
    express.raw({ type: '*/*' }),
    stripewebhook
  )
  app.post(
    '/v0/idenfy-callback',
    allowCorsUnrestricted,
    express.raw({ type: 'application/json' }),
    idenfyCallback
  )
  app.post('/follow-topic', ...apiRoute(followtopic))
  app.post('/league-activity', ...apiRoute(leagueActivity))
  app.post('/cancel-bounty', ...apiRoute(cancelbounty))
  app.post('/edit-answer-cpmm', ...apiRoute(editanswercpmm))
  app.post('/searchgiphy', ...apiRoute(searchgiphy))
  app.post('/manachantweet', ...apiRoute(manachantweet))
  app.post('/leave-review', ...apiRoute(leavereview))
  app.post('/cast-poll-vote', ...apiRoute(castpollvote))
  app.post(
    '/get-similar-groups-to-contract',
    ...apiRoute(getsimilargroupstocontract)
  )
  app.post('/follow-user', ...apiRoute(followUser))
  app.post('/report', ...apiRoute(report))

  app.post('/settv', ...apiRoute(settv))
  app.post('/deletetv', ...apiRoute(deletetv))

  app.post('/createdashboard', ...apiRoute(createdashboard))
  app.post('/getyourdashboards', ...apiRoute(getyourdashboards))
  app.post('/followdashboard', ...apiRoute(followdashboard))
  app.post('/supabasesearchdashboards', ...apiRoute(searchDashboards))
  app.post('/getyourfolloweddashboards', ...apiRoute(getyourfolloweddashboards))
  app.post('/updatedashboard', ...apiRoute(updatedashboard))
  app.post('/delete-dashboard', ...apiRoute(deletedashboard))
  app.get('/get-news-dashboards', ...apiRoute(getnews))
  app.post('/getdashboardfromslug', ...apiRoute(getdashboardfromslug))
  app.post('/ban-user', ...apiRoute(banuser))
  app.post(
    '/create-private-user-message',
    ...apiRoute(createprivateusermessage)
  )
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
}
