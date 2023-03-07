import * as cors from 'cors'
import * as express from 'express'
import { Express, Request, Response, NextFunction } from 'express'
import { EndpointDefinition } from './helpers'

const PORT = 8088

import { initAdmin } from 'shared/init-admin'
initAdmin()

import * as endpoints from '.'

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

addEndpointRoute('/health', endpoints.health)
addJsonEndpointRoute('/transact', endpoints.transact)
addJsonEndpointRoute('/changeuserinfo', endpoints.changeuserinfo)
addJsonEndpointRoute('/createuser', endpoints.createuser)
addJsonEndpointRoute('/createanswer', endpoints.createanswer)
addJsonEndpointRoute('/createcomment', endpoints.createcomment)
addJsonEndpointRoute('/swapcert', endpoints.swapcert)
addJsonEndpointRoute('/dividendcert', endpoints.dividendcert)
addJsonEndpointRoute('/placebet', endpoints.placebet)
addJsonEndpointRoute('/cancelbet', endpoints.cancelbet)
addJsonEndpointRoute('/sellbet', endpoints.sellbet)
addJsonEndpointRoute('/sellshares', endpoints.sellshares)
addJsonEndpointRoute('/addsubsidy', endpoints.addsubsidy)
addJsonEndpointRoute('/claimmanalink', endpoints.claimmanalink)
addJsonEndpointRoute('/createmarket', endpoints.createmarket)
addJsonEndpointRoute('/creategroup', endpoints.creategroup)
addJsonEndpointRoute('/resolvemarket', endpoints.resolvemarket)
addJsonEndpointRoute('/closemarket', endpoints.closemarket)
addJsonEndpointRoute('/unsubscribe', endpoints.unsubscribe)
addJsonEndpointRoute('/createcheckoutsession', endpoints.createcheckoutsession)
addJsonEndpointRoute('/getcurrentuser', endpoints.getcurrentuser)
addJsonEndpointRoute('/savetwitchcredentials', endpoints.savetwitchcredentials)
addEndpointRoute('/stripewebhook', endpoints.stripewebhook, express.raw())
addEndpointRoute('/createpost', endpoints.createpost)
addEndpointRoute('/testscheduledfunction', endpoints.testscheduledfunction)
addJsonEndpointRoute('/validateIap', endpoints.validateiap)
addJsonEndpointRoute('/markallnotifications', endpoints.markallnotifications)
addJsonEndpointRoute('/claimdestinysub', endpoints.claimdestinysub)
addJsonEndpointRoute('/updatememberrole', endpoints.updatememberrole)
addJsonEndpointRoute('/addcontracttogroup', endpoints.addcontracttogroup)
addJsonEndpointRoute(
  '/removecontractfromgroup',
  endpoints.removecontractfromgroup
)
addJsonEndpointRoute('/addgroupmember', endpoints.addgroupmember)

app.listen(PORT)
console.log(`Serving functions on port ${PORT}.`)
