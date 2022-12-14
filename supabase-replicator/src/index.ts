import * as express from 'express'
import * as admin from 'firebase-admin'
import { createSupabaseClient, replicateWrites } from './replicate-writes'
import { TLEntry } from '../../common/transaction-log'
import { CONFIGS } from '../../common/envs/constants'

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

admin.initializeApp()
const firestore = admin.firestore()
const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_KEY)

const app = express()
app.use(express.json())
app.post('/', async (req, res) => {
  const data = req.body?.message.data
  if (data == null) {
    res.status(400).send('No pub/sub message in body.')
    return
  }
  const entry = JSON.parse(Buffer.from(data, 'base64').toString()) as TLEntry
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
      .doc(entry.eventId)
      .create(entry)
  }
  console.log('Processed message.')
  res.status(204).send()
})

async function replayFailedWrites() {
  console.log('Checking for failed writes...')
  const failedWrites = await firestore
    .collection('replicationState')
    .doc('supabase')
    .collection('failedWrites')
    .limit(1000)
    .get()
  const deleter = firestore.bulkWriter({ throttling: false })
  if (failedWrites.size > 0) {
    console.log(`Attempting to replay ${failedWrites.size} write(s)...`)
    const entries = failedWrites.docs.map((d) => d.data() as TLEntry)
    await replicateWrites(supabase, ...entries)
    for (const doc of failedWrites.docs) {
      deleter.delete(doc.ref)
    }
  }
  await deleter.close()
}

const PORT = (process.env.PORT ? parseInt(process.env.PORT) : null) || 8080

app.listen(PORT, () =>
  console.log(`Replication server listening on port ${PORT}.`)
)

// poll and process failed writes every minute
setInterval(
  () => replayFailedWrites().catch((e) => console.error(e)),
  1000 * 60
)
