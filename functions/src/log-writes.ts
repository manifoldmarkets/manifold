import { DocumentData, DocumentSnapshot } from 'firebase-admin/firestore'
import * as functions from 'firebase-functions'
import { Change, EventContext } from 'firebase-functions'
import { PubSub } from '@google-cloud/pubsub'
import { DocumentKind, TLEntry } from '../../common/transaction-log'

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

function getTLEntry<T extends DocumentData>(
  change: Change<DocumentSnapshot<T>>,
  context: EventContext,
  docKind: DocumentKind
): TLEntry<T> {
  const info = getWriteInfo(change)
  return {
    docKind,
    writeKind: info.kind,
    eventId: context.eventId,
    docId: info.ref.id,
    parentId: context.params['parent'] ?? null,
    path: info.ref.path,
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

export const logUsers = logger('users/{id}', 'user')
export const logUserFollowers = logger(
  'users/{parent}/followers/{id}',
  'userFollower'
)
export const logContracts = logger('contracts/{id}', 'contract')
export const logContractAnswers = logger(
  'contracts/{parent}/answers/{id}',
  'contractAnswer'
)
export const logContractBets = logger(
  'contracts/{parent}/bets/{id}',
  'contractBet'
)
export const logContractComments = logger(
  'contracts/{parent}/comments/{id}',
  'contractComment'
)
export const logContractFollows = logger(
  'contracts/{parent}/follows/{id}',
  'contractFollow'
)
export const logContractLiquidity = logger(
  'contracts/{parent}/liquidity/{id}',
  'contractLiquidity'
)
export const logGroups = logger('groups/{id}', 'group')
export const logGroupContracts = logger(
  'groups/{parent}/groupContracts/{id}',
  'groupContract'
)
export const logGroupMembers = logger(
  'groups/{parent}/groupMembers/{id}',
  'groupMember'
)
export const logTxns = logger('txns/{id}', 'txn')
export const logManalinks = logger('manalinks/{id}', 'manalink')
export const logPosts = logger('posts/{id}', 'post')
export const logTest = logger('test/{id}', 'test')
