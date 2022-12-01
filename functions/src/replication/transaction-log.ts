import * as admin from 'firebase-admin'
import { CollectionReference, DocumentSnapshot } from 'firebase-admin/firestore'
import * as functions from 'firebase-functions'
import { Change, EventContext } from 'firebase-functions'
import { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseClient, run } from './utils'
import { DocumentKind, TLEntry } from '../../../common/transaction-log'
import { isProd } from '../utils'

function getWriteInfo<T>(change: Change<DocumentSnapshot<T>>) {
  const { before, after } = change
  if (before.exists && after.exists) {
    return { kind: 'update', ref: after.ref, data: after.data() as T } as const
  } else if (before.exists && !after.exists) {
    return { kind: 'delete', ref: before.ref, data: null } as const
  } else if (!before.exists && after.exists) {
    return { kind: 'create', ref: after.ref, data: after.data() as T } as const
  } else {
    throw new Error("Mysterious write; can't log.")
  }
}

function getTLEntry<T>(
  change: Change<DocumentSnapshot<T>>,
  context: EventContext,
  docKind: DocumentKind
) {
  const info = getWriteInfo(change)
  return {
    docKind,
    writeKind: info.kind,
    eventId: context.eventId,
    docId: info.ref.id,
    parent: info.ref.parent.path,
    data: info.data,
    ts: Date.parse(context.timestamp).valueOf(),
  }
}

function logger(path: string, docKind: DocumentKind) {
  const handler = (change: Change<DocumentSnapshot>, ctx: EventContext) => {
    const db = admin.firestore()
    const tl = db.collection('transactionLog') as CollectionReference<TLEntry>
    const entry = getTLEntry(change, ctx, docKind)
    return tl.doc(ctx.eventId).create(entry)
  }
  return functions.firestore.document(path).onWrite(handler)
}

async function replicateWrites(client: SupabaseClient, ...entries: TLEntry[]) {
  return await run(
    client.from('incoming_writes').insert(
      entries.map((e) => ({
        event_id: e.eventId,
        doc_kind: e.docKind,
        write_kind: e.writeKind,
        doc_id: e.docId,
        data: e.data,
        ts: new Date(e.ts).toISOString(),
      }))
    )
  )
}

export const logTxns = logger('txns/{g}', 'txn')
export const logGroups = logger('groups/{g}', 'group')
export const logUsers = logger('users/{u}', 'user')
export const logContracts = logger('contracts/{c}', 'contract')
export const logContractBets = logger('contracts/{c}/bets/{b}', 'contractBet')
export const logContractComments = logger(
  'contracts/{ct}/comments/{co}',
  'contractComment'
)

//TODO: We don't have a supabase replica/key for prod yet
const runtimeOpts = isProd() ? {} : { secrets: ['SUPABASE_KEY'] }
export const replicateLogToSupabase = functions
  .runWith(runtimeOpts)
  .firestore.document('transactionLog/{eventId}')
  .onCreate(async (doc) => {
    //TODO: We don't have a supabase replica for prod yet
    if (isProd()) return
    const entry = doc.data() as TLEntry
    try {
      await replicateWrites(createSupabaseClient(), entry)
    } catch (e) {
      const firestore = admin.firestore()
      await firestore
        .collection('replicationState')
        .doc('supabase')
        .collection('failedWrites')
        .doc(entry.eventId)
        .create({ eventId: entry.eventId })
      console.error(
        `Failed to replicate ${entry.docKind} ${entry.docId}. \
        Logging failed write: ${entry.eventId}.`,
        e
      )
    }
  })

export const replayFailedSupabaseWrites = functions
  .runWith(runtimeOpts)
  .pubsub.schedule('every 1 minutes')
  .onRun(async () => {
    //TODO: We don't have a supabase replica for prod yet
    if (isProd()) return
    const firestore = admin.firestore()
    const failedWrites = firestore
      .collection('replicationState')
      .doc('supabase')
      .collection('failedWrites')
    const snap = await failedWrites.get()
    if (snap.size === 0) {
      return
    }

    console.log(`Attempting to replay ${snap.size} write(s)...`)
    const client = createSupabaseClient()
    const entries = snap.docs.map((d) => d.data() as TLEntry)
    await replicateWrites(client, ...entries)

    console.log(`Removing old failed writes from log...`)
    const deleter = firestore.bulkWriter({ throttling: false })
    for (const doc of snap.docs) {
      deleter.delete(doc.ref)
    }
    await deleter.close()
  })
