import { DocumentData, DocumentSnapshot } from 'firebase-admin/firestore'
import * as functions from 'firebase-functions'
import { Change, EventContext } from 'firebase-functions'
import { PubSub } from '@google-cloud/pubsub'
import { TLEntry } from 'common/transaction-log'
import { Database } from 'common/supabase/schema'

type TableName = keyof Database['public']['Tables']

const pubSubClient = new PubSub()
const writeTopic = pubSubClient.topic('firestoreWrite')

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
  tableName: TableName
): TLEntry<T> {
  const info = getWriteInfo(change)
  return {
    tableId: tableName,
    writeKind: info.kind,
    eventId: context.eventId,
    docId: info.ref.id,
    parentId: context.params['parent'] ?? null,
    path: info.ref.path,
    data: info.data,
    ts: Date.parse(context.timestamp).valueOf(),
  }
}

function logger(path: string, tableName: TableName) {
  return functions.firestore.document(path).onWrite(async (change, ctx) => {
    const entry = getTLEntry(change, ctx, tableName)
    const messageId = await writeTopic.publishMessage({ json: entry })
    console.log(
      `Published: messageId=${messageId} eventId=${entry.eventId} kind=${entry.writeKind} docId=${entry.docId} parentId=${entry.parentId}`
    )
  })
}

export const logUsers = logger('users/{id}', 'users')
export const logUserPortfolioHistories = logger(
  'users/{parent}/portfolioHistory/{id}',
  'user_portfolio_history'
)
export const logUserContractMetrics = logger(
  'users/{parent}/contract-metrics/{id}',
  'user_contract_metrics'
)
export const logUserFollows = logger(
  'users/{parent}/follows/{id}',
  'user_follows'
)
export const logUserReactions = logger(
  'users/{parent}/reactions/{id}',
  'user_reactions'
)
export const logUserEvents = logger('users/{parent}/events/{id}', 'user_events')
export const logUserSeenMarkets = logger(
  'private-users/{parent}/seenMarkets/{id}',
  'user_seen_markets'
)
export const logContracts = logger('contracts/{id}', 'contracts')
export const logContractAnswers = logger(
  'contracts/{parent}/answers/{id}',
  'contract_answers'
)
export const logContractBets = logger(
  'contracts/{parent}/bets/{id}',
  'contract_bets'
)
export const logContractComments = logger(
  'contracts/{parent}/comments/{id}',
  'contract_comments'
)
export const logContractFollows = logger(
  'contracts/{parent}/follows/{id}',
  'contract_follows'
)
export const logContractLiquidity = logger(
  'contracts/{parent}/liquidity/{id}',
  'contract_liquidity'
)
export const logGroups = logger('groups/{id}', 'groups')
export const logGroupContracts = logger(
  'groups/{parent}/groupContracts/{id}',
  'group_contracts'
)
export const logGroupMembers = logger(
  'groups/{parent}/groupMembers/{id}',
  'group_members'
)
export const logTxns = logger('txns/{id}', 'txns')
export const logManalinks = logger('manalinks/{id}', 'manalinks')
export const logPosts = logger('posts/{id}', 'posts')
export const logTest = logger('test/{id}', 'test')
