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
import { createmarket } from './create-market'
import { createcomment } from './create-comment'
import { creategroup } from './create-group'
import { resolvemarket } from './resolve-market'
import { closemarket } from './close-market'
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
import { redeemad } from './redeem-ad-reward'

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

app.post('/transact', ...apiRoute(transact))
app.post('/changeuserinfo', ...apiRoute(changeuserinfo))
app.post('/createuser', ...apiRoute(createuser))
app.post('/createanswer', ...apiRoute(createanswer))
app.post('/createcomment', ...apiRoute(createcomment))
app.post('/swapcert', ...apiRoute(swapcert))
app.post('/dividendcert', ...apiRoute(dividendcert))
app.post('/placebet', ...apiRoute(placebet))
app.post('/cancelbet', ...apiRoute(cancelbet))
app.post('/sellbet', ...apiRoute(sellbet))
app.post('/sellshares', ...apiRoute(sellshares))
app.post('/addsubsidy', ...apiRoute(addsubsidy))
app.post('/claimmanalink', ...apiRoute(claimmanalink))
app.post('/createmarket', ...apiRoute(createmarket))
app.post('/creategroup', ...apiRoute(creategroup))
app.post('/resolvemarket', ...apiRoute(resolvemarket))
app.post('/closemarket', ...apiRoute(closemarket))
app.post('/unsubscribe', ...apiRoute(unsubscribe))
app.post('/savetwitchcredentials', ...apiRoute(savetwitchcredentials))
app.post('/createpost', ...apiRoute(createpost))
app.post('/validateIap', ...apiRoute(validateiap))
app.post('/markallnotifications', ...apiRoute(markallnotifications))
app.post('/updatememberrole', ...apiRoute(updatememberrole))
app.post('/updategroupprivacy', ...apiRoute(updategroupprivacy))
app.post('/registerdiscordid', ...apiRoute(registerdiscordid))
app.post('/addcontracttogroup', ...apiRoute(addcontracttogroup))
app.post('/removecontractfromgroup', ...apiRoute(removecontractfromgroup))
app.post('/addgroupmember', ...apiRoute(addgroupmember))
app.post('/redeemad', ...apiRoute(redeemad))

app.post('/createcheckoutsession', allowCors, createcheckoutsession)
app.post('/stripewebhook', allowCors, stripewebhook, express.raw())
