import * as cors from 'cors'
import * as express from 'express'
import { Express } from 'express'
import { EndpointDefinition } from './api'

const PORT = 8088

import { initAdmin } from './scripts/script-init'
initAdmin()

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
import { createmarket } from './create-contract'
import { addliquidity } from './add-liquidity'
import { withdrawliquidity } from './withdraw-liquidity'
import { creategroup } from './create-group'
import { resolvemarket } from './resolve-market'
import { unsubscribe } from './unsubscribe'
import { stripewebhook, createcheckoutsession } from './stripe'

const app = express()

const addEndpointRoute = (name: string, endpoint: EndpointDefinition) => {
  const method = endpoint.opts.method.toLowerCase() as keyof Express
  const corsMiddleware = cors({ origin: endpoint.opts.cors })
  const middleware = [express.json(), corsMiddleware]
  app.options(name, corsMiddleware) // preflight requests
  app[method](name, ...middleware, endpoint.handler)
}

addEndpointRoute('/health', health)
addEndpointRoute('/transact', transact)
addEndpointRoute('/changeuserinfo', changeuserinfo)
addEndpointRoute('/createuser', createuser)
addEndpointRoute('/createanswer', createanswer)
addEndpointRoute('/placebet', placebet)
addEndpointRoute('/cancelbet', cancelbet)
addEndpointRoute('/sellbet', sellbet)
addEndpointRoute('/sellshares', sellshares)
addEndpointRoute('/claimmanalink', claimmanalink)
addEndpointRoute('/createmarket', createmarket)
addEndpointRoute('/addliquidity', addliquidity)
addEndpointRoute('/withdrawliquidity', withdrawliquidity)
addEndpointRoute('/creategroup', creategroup)
addEndpointRoute('/resolvemarket', resolvemarket)
addEndpointRoute('/unsubscribe', unsubscribe)
addEndpointRoute('/stripewebhook', stripewebhook)
addEndpointRoute('/createcheckoutsession', createcheckoutsession)

app.listen(PORT)
console.log(`Serving functions on port ${PORT}.`)
