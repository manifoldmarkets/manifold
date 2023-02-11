import * as cors from 'cors'
import * as express from 'express'
import { Express, Request, Response, NextFunction } from 'express'
import { EndpointDefinition } from './api/api'

const PORT = 8088

import { initAdmin } from 'shared/init-admin'
initAdmin()

import { health } from './api/health'
import { transact } from './api/transact'
import { changeuserinfo } from './api/change-user-info'
import { createuser } from './api/create-user'
import { createanswer } from './api/create-answer'
import { placebet } from './api/place-bet'
import { cancelbet } from './api/cancel-bet'
import { sellbet } from './api/sell-bet'
import { sellshares } from './api/sell-shares'
import { claimmanalink } from './api/claim-manalink'
import { createmarket } from './api/create-market'
import { createcomment } from './api/create-comment'
import { creategroup } from './api/create-group'
import { resolvemarket } from './api/resolve-market'
import { closemarket } from './api/close-market'
import { unsubscribe } from './api/unsubscribe'
import { stripewebhook, createcheckoutsession } from './api/stripe'
import { getcurrentuser } from './api/get-current-user'
import { acceptchallenge } from './api/accept-challenge'
import { createpost } from './api/create-post'
import { savetwitchcredentials } from './api/save-twitch-credentials'
import { addsubsidy } from './api/add-subsidy'
import { testscheduledfunction } from './api/test-scheduled-function'
import { validateiap } from './api/validate-iap'
import { swapcert } from './api/swap-cert'
import { dividendcert } from './api/dividend-cert'
import { markallnotifications } from './api/mark-all-notifications'
import { claimdestinysub } from './api/claim-destiny-sub'
import { addcontracttogroup } from './api/add-contract-to-group'
import { updatememberrole } from './api/update-group-member-role'
import { removecontractfromgroup } from './api/remove-contract-from-group'

type Middleware = (req: Request, res: Response, next: NextFunction) => void
const app = express()

const addEndpointRoute = (
  path: string,
  endpoint: EndpointDefinition,
  ...middlewares: Middleware[]
) => {
  const method = endpoint.opts.method.toLowerCase() as keyof Express
  const corsMiddleware = cors({ origin: endpoint.opts.cors })
  const allMiddleware = [...middlewares, corsMiddleware]
  app.options(path, corsMiddleware) // preflight requests
  app[method](path, ...allMiddleware, endpoint.handler)
}

const addJsonEndpointRoute = (name: string, endpoint: EndpointDefinition) => {
  addEndpointRoute(name, endpoint, express.json())
}

addEndpointRoute('/health', health)
addJsonEndpointRoute('/transact', transact)
addJsonEndpointRoute('/changeuserinfo', changeuserinfo)
addJsonEndpointRoute('/createuser', createuser)
addJsonEndpointRoute('/createanswer', createanswer)
addJsonEndpointRoute('/createcomment', createcomment)
addJsonEndpointRoute('/swapcert', swapcert)
addJsonEndpointRoute('/dividendcert', dividendcert)
addJsonEndpointRoute('/placebet', placebet)
addJsonEndpointRoute('/cancelbet', cancelbet)
addJsonEndpointRoute('/sellbet', sellbet)
addJsonEndpointRoute('/sellshares', sellshares)
addJsonEndpointRoute('/addsubsidy', addsubsidy)
addJsonEndpointRoute('/claimmanalink', claimmanalink)
addJsonEndpointRoute('/createmarket', createmarket)
addJsonEndpointRoute('/creategroup', creategroup)
addJsonEndpointRoute('/resolvemarket', resolvemarket)
addJsonEndpointRoute('/closemarket', closemarket)
addJsonEndpointRoute('/unsubscribe', unsubscribe)
addJsonEndpointRoute('/createcheckoutsession', createcheckoutsession)
addJsonEndpointRoute('/getcurrentuser', getcurrentuser)
addJsonEndpointRoute('/acceptchallenge', acceptchallenge)
addJsonEndpointRoute('/savetwitchcredentials', savetwitchcredentials)
addEndpointRoute('/stripewebhook', stripewebhook, express.raw())
addEndpointRoute('/createpost', createpost)
addEndpointRoute('/testscheduledfunction', testscheduledfunction)
addJsonEndpointRoute('/validateIap', validateiap)
addJsonEndpointRoute('/markallnotifications', markallnotifications)
addJsonEndpointRoute('/claimdestinysub', claimdestinysub)
addJsonEndpointRoute('/updatememberrole', updatememberrole)
addJsonEndpointRoute('/addcontracttogroup', addcontracttogroup)
addJsonEndpointRoute('/removecontractfromgroup', removecontractfromgroup)

app.listen(PORT)
console.log(`Serving functions on port ${PORT}.`)
