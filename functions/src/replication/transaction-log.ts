import * as admin from 'firebase-admin'
import {
  CollectionReference,
  DocumentSnapshot,
  DocumentData,
} from 'firebase-admin/firestore'
import * as functions from 'firebase-functions'
import { Change, EventContext } from 'firebase-functions'
import { createSupabaseClient, run } from './utils'

type DocumentKind =
  | 'txn'
  | 'group'
  | 'user'
  | 'contract'
  | 'contractBet'
  | 'contractComment'

type WriteKind = 'create' | 'update' | 'delete'

type TLEntry<T extends DocumentData = DocumentData> = {
  eventId: string
  docKind: DocumentKind
  writeKind: WriteKind
  docId: string
  parent: string
  data: T | null
  ts: number
}

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

export const logTxns = logger('txns/{g}', 'txn')
export const logGroups = logger('groups/{g}', 'group')
export const logUsers = logger('users/{u}', 'user')
export const logContracts = logger('contracts/{c}', 'contract')
export const logBets = logger('contracts/{c}/bets/{b}', 'contractBet')
export const logComments = logger(
  'contracts/{ct}/comments/{co}',
  'contractComment'
)

export const replicateLogToSupabase = functions
  .runWith({ secrets: ['SUPABASE_KEY'] })
  .firestore.document('transactionLog/{eventId}')
  .onCreate(async (doc) => {
    const client = createSupabaseClient()
    if (client) {
      const entry = doc.data() as TLEntry
      await run(client.from('incoming_writes').insert(entry))
    } else {
      console.warn(`Couldn't connect to Supabase; not replicating ${doc.id}.`)
    }
  })
