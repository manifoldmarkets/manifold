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
import { placebet } from './place-bet'
import { cancelbet } from './cancel-bet'
import { sellbet } from './sell-bet'
import { sellshares } from './sell-shares'
import { claimmanalink } from './claim-manalink'
import { createmarket } from './create-market'
import { createcomment } from './create-comment'
import { gettoken } from './get-token'
import { creategroup } from './create-group'
import { resolvemarket } from './resolve-market'
import { unsubscribe } from './unsubscribe'
import { stripewebhook, createcheckoutsession } from './stripe'
import { getcurrentuser } from './get-current-user'
import { createpost } from './create-post'
import { savetwitchcredentials } from './save-twitch-credentials'
import { testscheduledfunction } from './test-scheduled-function'
import { addcommentbounty, awardcommentbounty } from './update-comment-bounty'

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
addJsonEndpointRoute('/gettoken', gettoken)
addJsonEndpointRoute('/placebet', placebet)
addJsonEndpointRoute('/cancelbet', cancelbet)
addJsonEndpointRoute('/sellbet', sellbet)
addJsonEndpointRoute('/sellshares', sellshares)
addJsonEndpointRoute('/claimmanalink', claimmanalink)
addJsonEndpointRoute('/createmarket', createmarket)
addJsonEndpointRoute('/addCommentBounty', addcommentbounty)
addJsonEndpointRoute('/awardCommentBounty', awardcommentbounty)
addJsonEndpointRoute('/creategroup', creategroup)
addJsonEndpointRoute('/resolvemarket', resolvemarket)
addJsonEndpointRoute('/unsubscribe', unsubscribe)
addJsonEndpointRoute('/createcheckoutsession', createcheckoutsession)
addJsonEndpointRoute('/getcurrentuser', getcurrentuser)
addJsonEndpointRoute('/savetwitchcredentials', savetwitchcredentials)
addEndpointRoute('/stripewebhook', stripewebhook, express.raw())
addEndpointRoute('/createpost', createpost)
addEndpointRoute('/testscheduledfunction', testscheduledfunction)

app.listen(PORT)
console.log(`Serving functions on port ${PORT}.`)
