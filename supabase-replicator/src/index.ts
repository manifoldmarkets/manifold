import * as express from 'express'
import * as admin from 'firebase-admin'
import { PubSub, Subscription, Message } from '@google-cloud/pubsub'
import {
  replicateWrites,
  createFailedWrites,
  replayFailedWrites,
} from './replicate-writes'
import { log } from './utils'
import { createClient } from '../../common/supabase/utils'
import { TLEntry } from '../../common/transaction-log'
import { CONFIGS } from '../../common/envs/constants'

const PORT = (process.env.PORT ? parseInt(process.env.PORT) : null) || 8080

const ENV = process.env.ENVIRONMENT ?? 'DEV'
const CONFIG = CONFIGS[ENV]
if (CONFIG == null) {
  throw new Error(`process.env.ENVIRONMENT = ${ENV} - should be DEV or PROD.`)
}

const SUPABASE_URL = CONFIG.supabaseUrl
if (!SUPABASE_URL) {
  throw new Error(`Can't connect to Supabase; no supabaseUrl set for ${ENV}.`)
}

const SUPABASE_KEY = process.env.SUPABASE_KEY
if (!SUPABASE_KEY) {
  throw new Error("Can't connect to Supabase; no process.env.SUPABASE_KEY.")
}

const pubsub = new PubSub()
const writeSub = pubsub.subscription('supabaseReplicationPullSubscription')
const firestore = admin.initializeApp().firestore()
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const app = express()
app.use(express.json())

app.post('/replay-failed', async (_req, res) => {
  log('INFO', 'Checking for failed writes...')
  try {
    const n = await replayFailedWrites(firestore, supabase)
    return res.status(200).json({ success: true, n })
  } catch (e) {
    log('ERROR', 'Error replaying failed writes.', e)
    return res.status(500).json({ error: (e as any).toString() })
  }
})

async function tryReplicateBatch(...messages: Message[]) {
  const entries = messages.map((m) => JSON.parse(m.data.toString()) as TLEntry)
  try {
    const t0 = process.hrtime.bigint()
    log('DEBUG', `Beginning replication of batch=${messages[0].id}.`)
    await replicateWrites(supabase, ...entries)
    const t1 = process.hrtime.bigint()
    const ms = (t1 - t0) / 1000000n
    log(
      'INFO',
      `Replicated batch=${messages[0].id} count=${entries.length}, time=${ms}ms.`
    )
  } catch (e) {
    log(
      'ERROR',
      `Failed to replicate batch=${messages[0].id} count=${entries.length}. Logging failed writes.`,
      e
    )
    await createFailedWrites(firestore, ...entries)
  }
  for (const msg of messages) {
    msg.ack()
  }
}

function processSubscriptionBatched(
  subscription: Subscription,
  process: (msgs: Message[]) => Promise<void>,
  batchSize: number,
  batchTimeoutMs: number
) {
  const batch: Message[] = []

  subscription.on('message', async (message) => {
    log('DEBUG', `Received message ${message.id}.`)
    batch.push(message)
    if (batch.length >= batchSize) {
      const toWrite = [...batch]
      batch.length = 0
      try {
        log('DEBUG', `Starting clear batch ${toWrite[0].id}.`)
        await process(toWrite)
      } catch (e) {
        log('ERROR', 'Big error processing messages:', e)
      }
    }
  })

  subscription.on('debug', (msg) => {
    log('INFO', 'Debug message from stream: ', msg)
  })

  subscription.on('error', (error) => {
    log('ERROR', 'Received error from subscription:', error)
  })

  return setInterval(async () => {
    if (batch.length > 0) {
      const toWrite = [...batch]
      batch.length = 0
      try {
        log('DEBUG', `Starting interval batch ${toWrite[0].id}.`)
        await process(toWrite)
      } catch (e) {
        log('ERROR', 'Big error processing messages:', e)
      }
    }
  }, batchTimeoutMs)
}

processSubscriptionBatched(
  writeSub,
  (msgs) => tryReplicateBatch(...msgs),
  1000,
  100
).unref() // unref() means it won't keep the process running if GCP stops the webserver

app.listen(PORT, () =>
  log('INFO', `Running in ${ENV} environment listening on port ${PORT}.`)
)
