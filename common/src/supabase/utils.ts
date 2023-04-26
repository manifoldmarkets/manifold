import {
  PostgrestResponse,
  PostgrestSingleResponse,
  SupabaseClient as SupabaseClientGeneric,
  SupabaseClientOptions as SupabaseClientOptionsGeneric,
  createClient as createClientGeneric,
} from '@supabase/supabase-js'

import { Database } from './schema'
import { User } from '../user'
import { Contract } from '../contract'
import { Bet } from '../bet'
import { ContractMetrics } from '../calculate-metrics'
import { Group, GroupMemberDoc, GroupContractDoc } from '../group'
import { UserEvent } from '../events'

export type Schema = Database['public']
export type Tables = Schema['Tables']
export type PlainTables = {
  [table in keyof Tables]: Tables[table]['Row']
}
export type Views = Schema['Views']
export type PlainViews = {
  [view in keyof Views]: Views[view]['Row']
}
export type PlainTablesAndViews = PlainTables & PlainViews
export type TableName = keyof Tables
export type ViewName = keyof Views
export type SupabaseClient = SupabaseClientGeneric<Database, 'public', Schema>

export type CollectionTableMapping = { [coll: string]: TableName }
export const collectionTables: CollectionTableMapping = {
  users: 'users',
  contracts: 'contracts',
  groups: 'groups',
  txns: 'txns',
  manalinks: 'manalinks',
  posts: 'posts',
  test: 'test',
}

export type SubcollectionTableMapping = {
  [parent: string]: { [child: string]: TableName }
}
export const subcollectionTables: SubcollectionTableMapping = {
  users: {
    'contract-metrics': 'user_contract_metrics',
    follows: 'user_follows',
    reactions: 'user_reactions',
    events: 'user_events',
    notifications: 'user_notifications',
  },
  'private-users': {
    seenMarkets: 'user_seen_markets',
  },
  contracts: {
    answers: 'contract_answers',
    bets: 'contract_bets',
    comments: 'contract_comments',
    follows: 'contract_follows',
    liquidity: 'contract_liquidity',
  },
  groups: {
    groupContracts: 'group_contracts',
    groupMembers: 'group_members',
  },
  posts: {
    comments: 'post_comments',
  },
}

export function getInstanceHostname(instanceId: string) {
  return `${instanceId}.supabase.co`
}

export function createClient(
  instanceId: string,
  key: string,
  opts?: SupabaseClientOptionsGeneric<'public'>
) {
  const url = `https://${getInstanceHostname(instanceId)}`
  return createClientGeneric(url, key, opts) as SupabaseClient
}

export type QueryResponse<T> = PostgrestResponse<T> | PostgrestSingleResponse<T>
export type QueryMultiSuccessResponse<T> = { data: T[]; count: number }
export type QuerySingleSuccessResponse<T> = { data: T; count: number }

export async function run<T>(
  q: PromiseLike<PostgrestResponse<T>>
): Promise<QueryMultiSuccessResponse<T>>
export async function run<T>(
  q: PromiseLike<PostgrestSingleResponse<T>>
): Promise<QuerySingleSuccessResponse<T>>
export async function run<T>(
  q: PromiseLike<PostgrestSingleResponse<T> | PostgrestResponse<T>>
) {
  const { data, count, error } = await q
  if (error != null) {
    throw error
  } else {
    return { data, count }
  }
}

type TableJsonTypes = {
  users: User
  user_events: UserEvent
  user_contract_metrics: ContractMetrics
  contracts: Contract
  cotracts_rbac: Contract
  contract_bets: Bet
  groups: Group
  group_members: GroupMemberDoc
  group_contracts: GroupContractDoc
}

export type DataFor<T extends TableName | ViewName> =
  T extends keyof TableJsonTypes ? TableJsonTypes[T] : any

export type RowFor<T extends TableName> = T extends TableName
  ? PlainTables[T]
  : any

export function selectJson<T extends TableName | ViewName>(
  db: SupabaseClient,
  table: T
) {
  return db.from(table).select<string, { data: DataFor<T> }>('data')
}

export function selectFrom<
  T extends TableName,
  TData extends DataFor<T>,
  TFields extends (string & keyof TData)[],
  TResult = Pick<TData, TFields[number]>
>(db: SupabaseClient, table: T, ...fields: TFields) {
  const query = fields.map((f) => `data->${f}`).join(', ')
  const builder = db.from(table).select<string, TResult>(query)
  return builder
}

export function selectFromView<
  V extends ViewName,
  VData extends DataFor<V>,
  VFields extends (string & keyof VData)[],
  VResult = Pick<VData, VFields[number]>
>(db: SupabaseClient, view: V, ...fields: VFields) {
  const query = fields.map((f) => `data->${f}`).join(', ')
  const builder = db.from(view).select<string, VResult>(query)
  return builder
}

export function millisToTs(millis: number) {
  return new Date(millis).toISOString()
}

export function tsToMillis(ts: string) {
  return Date.parse(ts)
}
