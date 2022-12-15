import * as express from 'express'
import * as admin from 'firebase-admin'
import {
  createSupabaseClient,
  replicateWrites,
  replayFailedWrites,
} from './replicate-writes'
import { TLEntry } from '../../common/transaction-log'
import { CONFIGS } from '../../common/envs/constants'

const ENV = process.env.ENVIRONMENT ?? 'DEV'
const CONFIG = CONFIGS[ENV]
if (CONFIG == null) {
  throw new Error(`process.env.ENVIRONMENT = ${ENV} - should be DEV or PROD.`)
}

console.log(`Running in ${ENV} environment.`)

const SUPABASE_URL = CONFIG.supabaseUrl
if (!SUPABASE_URL) {
  throw new Error(`Can't connect to Supabase; no supabaseUrl set for ${ENV}.`)
}

const SUPABASE_KEY = process.env.SUPABASE_KEY
if (!SUPABASE_KEY) {
  throw new Error("Can't connect to Supabase; no process.env.SUPABASE_KEY.")
}

const firestore = admin.initializeApp().firestore()
const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_KEY)
const app = express()
app.use(express.json())

app.post('/', async (req, res) => {
  const data = req.body?.message?.data
  if (data == null) {
    return res.status(400).json({ error: 'No pub/sub message in body.' })
  }
  let entry: TLEntry
  try {
    entry = JSON.parse(Buffer.from(data, 'base64').toString()) as TLEntry
  } catch (e) {
    console.error(e)
    return res.status(400).json({ error: 'Failed to parse data.' })
  }
  try {
    await replicateWrites(supabase, entry)
  } catch (e) {
    console.error(
      `Failed to replicate ${entry.docKind} ${entry.docId}. \
       Logging failed write: ${entry.eventId}.`,
      e
    )
    await firestore
      .collection('replicationState')
      .doc('supabase')
      .collection('failedWrites')
      .doc()
      .create(entry)
  }
  return res.status(204).json({ success: true })
})

app.post('/replay-failed', async (_req, res) => {
  console.log('Checking for failed writes...')
  try {
    const n = await replayFailedWrites(firestore, supabase)
    return res.status(200).json({ success: true, n })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: (e as any).toString() })
  }
})

const PORT = (process.env.PORT ? parseInt(process.env.PORT) : null) || 8080

app.listen(PORT, () =>
  console.log(`Replication server listening on port ${PORT}.`)
)
