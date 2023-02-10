import * as cors from 'cors'
import * as express from 'express'
import { Express, Request, Response, NextFunction } from 'express'
import { EndpointDefinition } from './api'

const PORT = 8088

import { initAdmin } from './scripts/script-init'
initAdmin()

import { health } from './health'
import { transact } from './transact'
import { changeuserinfo } from './change-user-info'
import { createuser } from './create-user'
import { createanswer } from './create-answer'
import { swapcert } from './swap-cert'
import { dividendcert } from './dividend-cert'
import { placebet } from './place-bet'
import { cancelbet } from './cancel-bet'
import { sellbet } from './sell-bet'
import { sellshares } from './sell-shares'
import { addsubsidy } from './add-subsidy'
import { claimmanalink } from './claim-manalink'
import { createmarket } from './create-market'
import { createcomment } from './create-comment'
import { creategroup } from './create-group'
import { resolvemarket } from './resolve-market'
import { unsubscribe } from './unsubscribe'
import { stripewebhook, createcheckoutsession } from './stripe'
import { getcurrentuser } from './get-current-user'
import { createpost } from './create-post'
import { savetwitchcredentials } from './save-twitch-credentials'
import { testscheduledfunction } from './test-scheduled-function'
import { validateiap } from './validate-iap'
import { markallnotifications } from './mark-all-notifications'
import { claimdestinysub } from './claim-destiny-sub'
import { updatememberrole } from './update-group-member-role'
import { addcontracttogroup } from './add-contract-to-group'
import { removecontractfromgroup } from './remove-contract-from-group'
import { updategroupprivacy } from './update-group-privacy'

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
addJsonEndpointRoute('/unsubscribe', unsubscribe)
addJsonEndpointRoute('/createcheckoutsession', createcheckoutsession)
addJsonEndpointRoute('/getcurrentuser', getcurrentuser)
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
addJsonEndpointRoute('/updategroupprivacy', updategroupprivacy)

app.listen(PORT)
console.log(`Serving functions on port ${PORT}.`)
