import {
  PostgrestResponse,
  PostgrestSingleResponse,
  SupabaseClient as SupabaseClientGeneric,
  SupabaseClientOptions as SupabaseClientOptionsGeneric,
  createClient as createClientGeneric,
} from '@supabase/supabase-js'

import { Database } from './schema'
import { User, PortfolioMetrics } from '../user'
import { Contract } from '../contract'
import { Bet } from '../bet'
import { ContractMetrics } from '../calculate-metrics'
import { Group, GroupMemberDoc, GroupContractDoc } from '../group'
import { UserEvent } from '../events'

export type Schema = Database['public']
export type Tables = Schema['Tables']
export type TableName = keyof Tables
export type SupabaseClient = SupabaseClientGeneric<Database, 'public', Schema>

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
  user_portfolio_history: PortfolioMetrics
  contracts: Contract
  contract_bets: Bet
  groups: Group
  group_members: GroupMemberDoc
  group_contracts: GroupContractDoc
}

type DataFor<T extends TableName> = T extends keyof TableJsonTypes
  ? TableJsonTypes[T]
  : any

export function selectJson<T extends TableName>(db: SupabaseClient, table: T) {
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
