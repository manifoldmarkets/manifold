import { spawn } from 'child_process'
import * as express from 'express'
import * as admin from 'firebase-admin'
import { PubSub, Message } from '@google-cloud/pubsub'
import {
  replicateWrites,
  createFailedWrites,
  replayFailedWrites,
  WriteMessage,
} from './replicate-writes'
import { log } from './utils'
import { CONFIGS } from 'common/envs/constants'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getInstanceHostname } from 'common/supabase/utils'

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

const SUPABASE_PASSWORD = process.env.SUPABASE_PASSWORD
if (!SUPABASE_PASSWORD) {
  throw new Error(
    `Can't connect to Supabase; no process.env.SUPABASE_PASSWORD.`
  )
}

const firestore = admin.initializeApp().firestore()
const pg = createSupabaseDirectClient(SUPABASE_INSTANCE_ID, SUPABASE_PASSWORD)

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

app.post('/repack', async (req, res) => {
  log('INFO', '[repack] Starting...')
  try {
    await new Promise<void>((resolve, reject) => {
      const { tableName } = req.body
      const host = `db.${getInstanceHostname(SUPABASE_INSTANCE_ID)}`
      const args = ['-h', host, '-p', '5432', '-d', 'postgres']
      // If table name is provided, add it to the arguments
      if (tableName) args.push('-t', tableName)
      else args.push(...['-c', 'public'])

      const proc = spawn('/usr/libexec/postgresql15/pg_repack', args, {
        env: {
          PGUSER: 'postgres',
          PGPASSWORD: SUPABASE_PASSWORD,
          PGOPTIONS:
            // make sure that the TCP connection doesn't drop on long repack operations
            '-c tcp_keepalives_idle=60 -c tcp_keepalives_interval=5 -c tcp_keepalives_count=4',
        },
      })
      proc.stdout.on('data', (data) => log('INFO', `[repack] ${data}`))
      proc.stderr.on('data', (data) => log('INFO', `[repack] ${data}`))
      proc.on('close', (code) => {
        if (code === 0) {
          log('INFO', `[repack] Finished.`)
          resolve()
        } else {
          reject(new Error(`pg_repack exited with code ${code}.`))
        }
      })
    })
    return res.status(200).json({ success: true })
  } catch (e) {
    log('ERROR', '[repack] Error running pg_repack.', e)
    return res.status(500).json({ error: (e as any).toString() })
  }
})

type ParsedMessage<T> = { msg: Message; data: T }

function parseMessage<T>(msg: Message): ParsedMessage<T> {
  return { msg, data: JSON.parse(msg.data.toString()) }
}

async function tryReplicateBatch(batchId: number, ...entries: WriteMessage[]) {
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

const batch: ParsedMessage<WriteMessage>[] = []
let batchCount = 0
async function processBatch(kind: string) {
  if (batch.length > 0) {
    const batchId = batchCount++
    const toWrite = [...batch]
    batch.length = 0
    log('DEBUG', `Starting ${kind} batch=${batchId}.`)
    await tryReplicateBatch(batchId, ...toWrite.map((x) => x.data))
    for (const x of toWrite) {
      x.msg.ack()
    }
  }
}

const pubsub = new PubSub()
const writeSub = pubsub.subscription('supabaseReplicationPullSubscription')

writeSub.on('message', async (message) => {
  try {
    const parsed = parseMessage<WriteMessage>(message)
    const entry = parsed.data
    log(
      'DEBUG',
      `Received message id=${message.id} batch=${batchCount} eventId=${entry.eventId} kind=${entry.writeKind} tableId=${entry.tableId} parentId=${entry.parentId} docId=${entry.docId}.`
    )
    batch.push(parsed)
    if (batch.length >= 1000) {
      await processBatch('clear')
    }
  } catch (e) {
    log('ERROR', 'Big error processing message:', e)
  }
})

writeSub.on('close', async () => {
  log('INFO', 'Closing subscription.')
})

writeSub.on('debug', (msg) => {
  log('INFO', 'Debug message from stream: ', msg)
})

writeSub.on('error', (error) => {
  log('ERROR', 'Received error from subscription:', error)
})

const processingInterval = setInterval(async () => {
  if (batch.length > 0) {
    await processBatch('interval')
  }
}, 100)

const server = app.listen(PORT, () => {
  log('INFO', `Running in ${ENV} environment listening on port ${PORT}.`)

  process.on('SIGTERM', async () => {
    log('INFO', 'Shutting down.')
    await new Promise((resolve) => server.close(resolve))
    clearInterval(processingInterval)
    await writeSub.close()
    await processBatch('final')
    process.exit(0)
  })
})
