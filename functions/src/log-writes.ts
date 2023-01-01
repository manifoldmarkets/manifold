import { DocumentSnapshot } from 'firebase-admin/firestore'
import * as functions from 'firebase-functions'
import { Change, EventContext } from 'firebase-functions'
import { PubSub } from '@google-cloud/pubsub'
import { DocumentKind } from '../../common/transaction-log'

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

export const logUsers = logger('users/{u}', 'user')
export const logUserFollowers = logger(
  'users/{u}/{followers}/{f}',
  'userFollower'
)
export const logContracts = logger('contracts/{c}', 'contract')
export const logContractAnswers = logger(
  'contracts/{c}/answers/{b}',
  'contractAnswer'
)
export const logContractBets = logger('contracts/{c}/bets/{b}', 'contractBet')
export const logContractComments = logger(
  'contracts/{ct}/comments/{co}',
  'contractComment'
)
export const logContractFollows = logger(
  'contracts/{ct}/follows/{f}',
  'contractFollow'
)
export const logContractLiquidity = logger(
  'contracts/{ct}/liquidity/{l}',
  'contractLiquidity'
)
export const logGroups = logger('groups/{g}', 'group')
export const logGroupContracts = logger(
  'groups/{gr}/groupContracts/{gc}',
  'groupContract'
)
export const logGroupMembers = logger(
  'groups/{gr}/groupMembers/{gm}',
  'groupMember'
)
export const logTxns = logger('txns/{g}', 'txn')
export const logManalinks = logger('manalinks/{m}', 'manalink')
export const logPosts = logger('posts/{p}', 'post')
export const logTest = logger('test/{t}', 'test')
