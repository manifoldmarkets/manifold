import { DocumentData, DocumentSnapshot } from 'firebase-admin/firestore'
import * as functions from 'firebase-functions'
import { Change, EventContext } from 'firebase-functions'
import { PubSub } from '@google-cloud/pubsub'
import { DocumentKind, TLEntry } from '../../common/transaction-log'
import { Database } from '../../common/supabase/schema'

type TableName = keyof Database['public']['Tables']

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
  docKind: DocumentKind,
  tableName: TableName
): TLEntry<T> {
  const info = getWriteInfo(change)
  return {
    docKind,
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

function logger(path: string, docKind: DocumentKind, tableName: TableName) {
  return functions.firestore.document(path).onWrite((change, ctx) => {
    const entry = getTLEntry(change, ctx, docKind, tableName)
    return pubSubClient.topic('firestoreWrite').publishMessage({ json: entry })
  })
}

export const logUsers = logger('users/{id}', 'user', 'users')
export const logUserPortfolioHistories = logger(
  'users/{parent}/portfolioHistory/{id}',
  'userPortfolioHistory',
  'user_portfolio_history'
)
export const logUserContractMetrics = logger(
  'users/{parent}/contract-metrics/{id}',
  'userContractMetrics',
  'user_contract_metrics'
)
export const logUserFollows = logger(
  'users/{parent}/follows/{id}',
  'userFollow',
  'user_follows'
)
export const logUserReactions = logger(
  'users/{parent}/reactions/{id}',
  'userReaction',
  'user_reactions'
)
export const logUserEvents = logger(
  'users/{parent}/events/{id}',
  'userEvent',
  'user_events'
)
export const logUserSeenMarkets = logger(
  'private-users/{parent}/seenMarkets/{id}',
  'userSeenMarket',
  'user_seen_markets'
)
export const logContracts = logger('contracts/{id}', 'contract', 'contracts')
export const logContractAnswers = logger(
  'contracts/{parent}/answers/{id}',
  'contractAnswer',
  'contract_answers'
)
export const logContractBets = logger(
  'contracts/{parent}/bets/{id}',
  'contractBet',
  'contract_bets'
)
export const logContractComments = logger(
  'contracts/{parent}/comments/{id}',
  'contractComment',
  'contract_comments'
)
export const logContractFollows = logger(
  'contracts/{parent}/follows/{id}',
  'contractFollow',
  'contract_follows'
)
export const logContractLiquidity = logger(
  'contracts/{parent}/liquidity/{id}',
  'contractLiquidity',
  'contract_liquidity'
)
export const logGroups = logger('groups/{id}', 'group', 'groups')
export const logGroupContracts = logger(
  'groups/{parent}/groupContracts/{id}',
  'groupContract',
  'group_contracts'
)
export const logGroupMembers = logger(
  'groups/{parent}/groupMembers/{id}',
  'groupMember',
  'group_members'
)
export const logTxns = logger('txns/{id}', 'txn', 'txns')
export const logManalinks = logger('manalinks/{id}', 'manalink', 'manalinks')
export const logPosts = logger('posts/{id}', 'post', 'posts')
export const logTest = logger('test/{id}', 'test', 'test')
