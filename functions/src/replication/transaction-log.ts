import * as admin from 'firebase-admin'
import { DocumentSnapshot } from 'firebase-admin/firestore'
import * as functions from 'firebase-functions'
import { Change, EventContext } from 'firebase-functions'
import { onMessagePublished } from 'firebase-functions/v2/pubsub'
import { SupabaseClient } from '@supabase/supabase-js'
import { PubSub } from '@google-cloud/pubsub'
import { chunk } from 'lodash'

import { createSupabaseClient, run } from './utils'
import { DocumentKind, TLEntry } from '../../../common/transaction-log'

const pubSubClient = new PubSub()

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
  return functions.firestore.document(path).onWrite((change, ctx) => {
    const entry = getTLEntry(change, ctx, docKind)
    pubSubClient.topic('firestoreWrite').publishMessage({ json: entry })
  })
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

export const replicateLogToSupabase = onMessagePublished(
  {
    topic: 'firestoreWrite',
    secrets: ['SUPABASE_KEY'],
    cpu: 2,
    minInstances: 2,
    concurrency: 1000,
    memory: '2GiB',
  },
  async (event) => {
    const entry = event.data.message.json() as TLEntry
    const db = admin.firestore()
    try {
      await Promise.all([
        db.collection('transactionLog').doc(entry.eventId).create(entry),
        replicateWrites(createSupabaseClient(), entry),
      ])
    } catch (e) {
      await db
        .collection('replicationState')
        .doc('supabase')
        .collection('failedWrites')
        .doc(entry.eventId)
        .create(entry)
      console.error(
        `Failed to replicate ${entry.docKind} ${entry.docId}. \
        Logging failed write: ${entry.eventId}.`,
        e
      )
    }
  }
)

export const replayFailedSupabaseWrites = functions
  .runWith({ secrets: ['SUPABASE_KEY'] })
  .pubsub.schedule('every 1 minutes')
  .onRun(async () => {
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
    const deleter = firestore.bulkWriter({ throttling: false })
    try {
      for (const batch of chunk(snap.docs, 1000)) {
        const entries = snap.docs.map((d) => d.data() as TLEntry)
        await replicateWrites(client, ...entries)
        for (const doc of batch) {
          deleter.delete(doc.ref)
        }
      }
    } catch (e) {
      console.error(e)
    }
    await deleter.close()
  })
