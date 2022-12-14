import * as admin from 'firebase-admin'
import { DocumentSnapshot } from 'firebase-admin/firestore'
import * as functions from 'firebase-functions'
import { Change, EventContext } from 'firebase-functions'
import { onMessagePublished } from 'firebase-functions/v2/pubsub'
import { SupabaseClient } from '@supabase/supabase-js'
import { PubSub } from '@google-cloud/pubsub'

import { run } from '../../../common/supabase/utils'
import { createSupabaseClient, processPaginated } from '../utils'
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
    return pubSubClient.topic('firestoreWrite').publishMessage({ json: entry })
  })
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

export const replayFailedSupabaseWrites = functions
  .runWith({ secrets: ['SUPABASE_KEY'], timeoutSeconds: 540 })
  .pubsub.schedule('every 1 minutes')
  .onRun(async () => {
    const firestore = admin.firestore()
    const failedWrites = firestore
      .collection('replicationState')
      .doc('supabase')
      .collection('failedWrites')
    const client = createSupabaseClient()
    const deleter = firestore.bulkWriter({ throttling: false })
    await processPaginated(failedWrites, 1000, async (snaps) => {
      if (snaps.size > 0) {
        console.log(`Attempting to replay ${snaps.size} write(s)...`)
        const entries = snaps.docs.map((d) => d.data() as TLEntry)
        await replicateWrites(client, ...entries)
        for (const doc of snaps.docs) {
          deleter.delete(doc.ref)
        }
      }
      await deleter.flush()
    })
    await deleter.close()
  })
