import * as express from 'express'

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
import { getdailybonuses } from './get-daily-bonuses'
import { unsubscribe } from './unsubscribe'
import { stripewebhook, createcheckoutsession } from './stripe'

const app = express()

app.all('/health', health.handler)
app.all('/transact', transact.handler)
app.all('/changeuserinfo', changeuserinfo.handler)
app.all('/createuser', createuser.handler)
app.all('/createanswer', createanswer.handler)
app.all('/placebet', placebet.handler)
app.all('/cancelbet', cancelbet.handler)
app.all('/sellbet', sellbet.handler)
app.all('/sellshares', sellshares.handler)
app.all('/claimmanalink', claimmanalink.handler)
app.all('/createmarket', createmarket.handler)
app.all('/addliquidity', addliquidity.handler)
app.all('/withdrawliquidity', withdrawliquidity.handler)
app.all('/creategroup', creategroup.handler)
app.all('/resolvemarket', resolvemarket.handler)
app.all('/getdailybonuses', getdailybonuses.handler)
app.all('/unsubscribe', unsubscribe.handler)
app.all('/stripewebhook', stripewebhook.handler)
app.all('/createcheckoutsession', createcheckoutsession.handler)

app.listen(8080)
