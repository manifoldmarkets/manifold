import * as cors from 'cors'
import * as express from 'express'
import { ErrorRequestHandler, RequestHandler } from 'express'
import {
  CORS_ORIGIN_MANIFOLD,
  CORS_ORIGIN_LOCALHOST,
  CORS_ORIGIN_VERCEL,
} from 'common/envs/constants'
import { log } from 'shared/utils'
import { APIError } from 'common/api'

import { health } from './health'
import { transact } from './transact'
import { changeuserinfo } from './change-user-info'
import { createuser } from './create-user'
import { createanswer } from './create-answer'
import { placebet } from './place-bet'
import { cancelbet } from './cancel-bet'
import { sellbet } from './sell-bet'
import { sellshares } from './sell-shares'
import { claimmanalink } from './claim-manalink'
import { createquestion } from './create-question'
import { createcomment } from './create-comment'
import { creategroup } from './create-group'
import { resolvequestion } from './resolve-question'
import { closequestion } from './close-question'
import { unsubscribe } from './unsubscribe'
import { stripewebhook, createcheckoutsession } from './stripe-endpoints'
import { getcurrentuser } from './get-current-user'
import { createpost } from './create-post'
import { savetwitchcredentials } from './save-twitch-credentials'
import { addsubsidy } from './add-subsidy'
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
import { redeemad } from './redeem-ad-reward'
import { completequest } from './complete-quest'
import { getsupabasetoken } from './get-supabase-token'
import { updateUserEmbedding } from './update-user-embedding'
import { auctionbid } from './auction-bid'
import { supabasesearchcontracts } from './supabase-search-contract'
import { deleteQuestion } from './delete-question'
import { saveTopic } from './save-topic'
import { getcontractparams } from './get-contract-params'
import { boostquestion } from './create-question-ad'
import { redeemboost } from './redeem-question-ad-reward'
import { creategroupinvite } from './create-group-invite'
import { joingroupthroughinvite } from './join-group-through-invite'
import { joingroup } from './join-group'
import { editcomment } from 'api/edit-comment'
import { supabasesearchgroups } from './supabase-search-groups'
import { leagueActivity } from './league-activity'
import { lootbox } from './loot-box'
import { createQAndA } from './create-q-and-a'
import { createQAndAAnswer } from './create-q-and-a-answer'
import { awardQAndAAnswer } from './award-q-and-a-answer'
import { createchatmessage } from 'api/create-chat-message'
import { updatepost } from './update-post'
import { updategroup } from './update-group'
import { updateUserDisinterestEmbedding } from 'api/update-user-disinterests'

const allowCors: RequestHandler = cors({
  origin: [CORS_ORIGIN_MANIFOLD, CORS_ORIGIN_VERCEL, CORS_ORIGIN_LOCALHOST],
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
    res.status(500).json({ message: 'An unknown error occurred.' })
  }
}

export const app = express()
app.use(requestLogger)

const apiRoute = (endpoint: RequestHandler) => {
  return [allowCors, express.json(), endpoint, apiErrorHandler] as const
}

app.options('*', allowCors)
app.get('/health', ...apiRoute(health))
app.get('/getcurrentuser', ...apiRoute(getcurrentuser))
app.get('/unsubscribe', ...apiRoute(unsubscribe))

app.post('/lootbox', ...apiRoute(lootbox))
app.post('/auctionbid', ...apiRoute(auctionbid))
app.post('/transact', ...apiRoute(transact))
app.post('/changeuserinfo', ...apiRoute(changeuserinfo))
app.post('/createuser', ...apiRoute(createuser))
app.post('/createanswer', ...apiRoute(createanswer))
app.post('/createcomment', ...apiRoute(createcomment))
app.post('/createchatmessage', ...apiRoute(createchatmessage))
app.post('/editcomment', ...apiRoute(editcomment))
app.post('/swapcert', ...apiRoute(swapcert))
app.post('/dividendcert', ...apiRoute(dividendcert))
app.post('/placebet', ...apiRoute(placebet))
app.post('/cancelbet', ...apiRoute(cancelbet))
app.post('/sellbet', ...apiRoute(sellbet))
app.post('/sellshares', ...apiRoute(sellshares))
app.post('/addsubsidy', ...apiRoute(addsubsidy))
app.post('/claimmanalink', ...apiRoute(claimmanalink))
app.post('/createquestion', ...apiRoute(createquestion))
app.post('/creategroup', ...apiRoute(creategroup))
app.post('/updategroup', ...apiRoute(updategroup))
app.post('/resolvequestion', ...apiRoute(resolvequestion))
app.post('/closequestion', ...apiRoute(closequestion))
app.post('/savetwitchcredentials', ...apiRoute(savetwitchcredentials))
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
app.post('/redeemad', ...apiRoute(redeemad))
app.post('/completequest', ...apiRoute(completequest))
app.post('/update-user-embedding', ...apiRoute(updateUserEmbedding))
app.post(
  '/update-user-disinterest-embedding',
  ...apiRoute(updateUserDisinterestEmbedding)
)
app.get('/getsupabasetoken', ...apiRoute(getsupabasetoken))
app.post('/supabasesearchcontracts', ...apiRoute(supabasesearchcontracts))
app.post('/delete-question', ...apiRoute(deleteQuestion))
app.post('/save-topic', ...apiRoute(saveTopic))
app.post('/boost-question', ...apiRoute(boostquestion))
app.post('/redeem-boost', ...apiRoute(redeemboost))

app.post('/createcheckoutsession', allowCors, createcheckoutsession)
app.post(
  '/stripewebhook',
  allowCors,
  express.raw({ type: '*/*' }),
  stripewebhook
)
app.post('/getcontractparams', ...apiRoute(getcontractparams))
app.post('/creategroupinvite', ...apiRoute(creategroupinvite))
app.post('/joingroupthroughinvite', ...apiRoute(joingroupthroughinvite))
app.post('/joingroup', ...apiRoute(joingroup))
app.post('/supabasesearchgroups', ...apiRoute(supabasesearchgroups))
app.post('/league-activity', ...apiRoute(leagueActivity))
app.post('/create-q-and-a', ...apiRoute(createQAndA))
app.post('/create-q-and-a-answer', ...apiRoute(createQAndAAnswer))
app.post('/award-q-and-a-answer', ...apiRoute(awardQAndAAnswer))

// Catch 404 errors - this should be the last route
app.use((req, res, next) => {
  res
    .status(404)
    .set('Content-Type', 'application/json')
    .json({
      error: {
        message: `The requested route '${req.path}' does not exist. Please check your URL for any misspellings or refer to app.ts`,
      },
    })
})
