import { DocumentData, DocumentSnapshot } from 'firebase-admin/firestore'
import { Change, EventContext, firestore } from 'firebase-functions'
import { PubSub } from '@google-cloud/pubsub'
import {
  TableName,
  collectionTables,
  subcollectionTables,
} from 'common/supabase/utils'
const RUNNING_EMULATOR = process.env.EMULATOR === 'true'
const pubSubClient = new PubSub()
const writeTopic = pubSubClient.topic('firestoreWrite')

function getWriteInfo<T>(change: Change<DocumentSnapshot<T>>) {
  const { before, after } = change
  if (before.exists && after.exists) {
    return { writeKind: 'update', ref: after.ref, data: after.data() } as const
  } else if (before.exists && !after.exists) {
    return { writeKind: 'delete', ref: before.ref, data: null } as const
  } else if (!before.exists && after.exists) {
    return { writeKind: 'create', ref: after.ref, data: after.data() } as const
  } else {
    throw new Error("Mysterious write; can't log.")
  }
}

async function publishChange<T extends DocumentData>(
  change: Change<DocumentSnapshot<T>>,
  context: EventContext,
  tableId: TableName
) {
  const { writeKind, ref, data } = getWriteInfo(change)
  const { eventId, params, timestamp } = context
  const { id: docId, path } = ref
  const parentId = params['parent'] ?? null
  const ts = Date.parse(timestamp).valueOf()
  const msg = { ts, eventId, writeKind, tableId, path, parentId, docId, data }
  const msgId = await writeTopic.publishMessage({ json: msg })
  const logFields = { msgId, eventId, writeKind, tableId, parentId, docId }
  console.log(
    `Published: ${Object.entries(logFields)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')}`
  )
}

export const logCollections = firestore
  .document('{coll}/{id}')
  .onWrite(async (change, ctx) => {
    if (RUNNING_EMULATOR) return
    const tableName = collectionTables[ctx.params.coll]
    if (tableName != null) {
      await publishChange(change, ctx, tableName)
    }
  })

export const logSubcollections = firestore
  .document('{coll}/{parent}/{subcoll}/{id}')
  .onWrite(async (change, ctx) => {
    if (RUNNING_EMULATOR) return
    const tableName = subcollectionTables[ctx.params.coll]?.[ctx.params.subcoll]
    if (tableName != null) {
      await publishChange(change, ctx, tableName)
    }
  })
