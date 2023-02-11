import * as express from 'express'
import * as admin from 'firebase-admin'
import { PubSub, Subscription, Message } from '@google-cloud/pubsub'
import {
  replicateWrites,
  createFailedWrites,
  replayFailedWrites,
} from './replicate-writes'
import { log } from './utils'
import { TLEntry } from 'common/transaction-log'
import { CONFIGS } from 'common/envs/constants'
import { createSupabaseDirectClient } from 'shared/supabase/init'

const PORT = (process.env.PORT ? parseInt(process.env.PORT) : null) || 8080

const ENV = process.env.ENVIRONMENT ?? 'DEV'
const CONFIG = CONFIGS[ENV]
if (CONFIG == null) {
  throw new Error(`process.env.ENVIRONMENT = ${ENV} - should be DEV or PROD.`)
}

const SUPABASE_INSTANCE_ID = CONFIG.supabaseInstanceId
if (!SUPABASE_INSTANCE_ID) {
  throw new Error(`Can't connect to Supabase; no instance ID set for ${ENV}.`)
}

const pubsub = new PubSub()
const writeSub = pubsub.subscription('supabaseReplicationPullSubscription')
const firestore = admin.initializeApp().firestore()
const pg = createSupabaseDirectClient(SUPABASE_INSTANCE_ID)

const app = express()
app.use(express.json())

app.post('/replay-failed', async (_req, res) => {
  log('INFO', 'Checking for failed writes...')
  try {
    const n = await replayFailedWrites(firestore, pg)
    return res.status(200).json({ success: true, n })
  } catch (e) {
    log('ERROR', 'Error replaying failed writes.', e)
    return res.status(500).json({ error: (e as any).toString() })
  }
})

type ParsedMessage<T> = { msg: Message; data: T }

function parseMessage<T>(msg: Message): ParsedMessage<T> {
  return { msg, data: JSON.parse(msg.data.toString()) }
}

async function tryReplicateBatch(batchId: number, ...entries: TLEntry[]) {
  try {
    const t0 = process.hrtime.bigint()
    log('DEBUG', `Beginning replication of batch=${batchId}.`)
    await replicateWrites(pg, ...entries)
    const t1 = process.hrtime.bigint()
    const ms = (t1 - t0) / 1000000n
    log(
      'INFO',
      `Replicated batch=${batchId} count=${entries.length}, time=${ms}ms.`
    )
  } catch (e) {
    log(
      'ERROR',
      `Failed to replicate batch=${batchId} count=${entries.length}. Logging failed writes.`,
      e
    )
    await createFailedWrites(firestore, ...entries)
  }
}

function processSubscriptionBatched(
  subscription: Subscription,
  batchSize: number,
  batchTimeoutMs: number
) {
  let i = 0
  const batch: ParsedMessage<TLEntry>[] = []

  const processBatch = async (kind: string) => {
    if (batch.length > 0) {
      const batchId = i++
      const toWrite = [...batch]
      batch.length = 0
      log('DEBUG', `Starting ${kind} batch=${batchId}.`)
      await tryReplicateBatch(batchId, ...toWrite.map((x) => x.data))
      for (const x of toWrite) {
        x.msg.ack()
      }
    }
  }

  subscription.on('message', async (message) => {
    try {
      const parsed = parseMessage<TLEntry>(message)
      const entry = parsed.data
      log(
        'DEBUG',
        `Received message id=${message.id} batch=${i} eventId=${entry.eventId} kind=${entry.writeKind} tableId=${entry.tableId} parentId=${entry.parentId} docId=${entry.docId}.`
      )
      batch.push(parsed)
      if (batch.length >= batchSize) {
        await processBatch('clear')
      }
    } catch (e) {
      log('ERROR', 'Big error processing message:', e)
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
      await processBatch('interval')
    }
  }, batchTimeoutMs)
}

// unref() means it won't keep the process running if GCP stops the webserver
processSubscriptionBatched(writeSub, 1000, 100).unref()

app.listen(PORT, () =>
  log('INFO', `Running in ${ENV} environment listening on port ${PORT}.`)
)
