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
import { ContractMetric } from '../contract-metric'
import { Group } from '../group'

export type Schema = Database['public']
export type Tables = Schema['Tables']
export type Views = Schema['Views']
export type TableName = keyof Tables
export type ViewName = keyof Views
export type Selectable = TableName | ViewName
export type Row<T extends Selectable> = T extends TableName
  ? Tables[T]['Row']
  : T extends ViewName
  ? Views[T]['Row']
  : never
export type Column<T extends Selectable> = keyof Row<T> & string

export type SupabaseClient = SupabaseClientGeneric<Database, 'public', Schema>

export type CollectionTableMapping = { [coll: string]: TableName }
export const collectionTables: CollectionTableMapping = {
  users: 'users',
  contracts: 'contracts',
  txns: 'txns',
  manalinks: 'manalinks',
}

export type SubcollectionTableMapping = {
  [parent: string]: { [child: string]: TableName }
}
export const subcollectionTables: SubcollectionTableMapping = {
  users: {
    follows: 'user_follows',
    reactions: 'user_reactions',
  },
  contracts: {
    answers: 'contract_answers',
    answersCpmm: 'answers',
    bets: 'contract_bets',
    comments: 'contract_comments',
    follows: 'contract_follows',
    liquidity: 'contract_liquidity',
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

type JsonTypes = {
  users: User
  user_contract_metrics: ContractMetric
  contracts: Contract
  cotracts_rbac: Contract
  contract_bets: Bet
  public_contract_bets: Bet
  groups: Group
}

export type DataFor<T extends Selectable> = T extends keyof JsonTypes
  ? JsonTypes[T]
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

export function millisToTs(millis: number) {
  return new Date(millis).toISOString()
}

export function tsToMillis(ts: string) {
  return Date.parse(ts)
}

type SnakeToCamel<S extends string> = S extends `${infer T}_${infer U}`
  ? `${Lowercase<T>}${Capitalize<SnakeToCamel<U>>}`
  : S

const camelize = <S extends string>(s: S) =>
  s.replace(/(_\w)/g, (m) => m[1].toUpperCase()) as SnakeToCamel<S>

// sql column ->  converter function or false
type TypeConverter<R extends Selectable, T extends Record<string, any>> = {
  [key in Column<R>]?: SnakeToCamel<key> extends keyof T
    ? ((r: Row<R>[key]) => T[SnakeToCamel<key>]) | false
    : false
}

/**
 * Convert a sql row to its frontend data type.
 * Changes snake_case to camelCase.
 * You can also specify conversion functions for each column, or set it to false to filter it.
 */
export const mapTypes = <R extends Selectable, T extends Record<string, any>>(
  sqlData: Partial<Row<R> & { data: any }>,
  converters: TypeConverter<R, T>
) => {
  const { data = {}, ...rows } = sqlData

  const entries = Object.entries(rows)

  const m = entries
    .map((entry) => {
      const [key, val] = entry as [Column<R>, Row<R>[Column<R>]]

      const convert = converters[key]
      if (convert === false) return null
      return [camelize(key), convert?.(val) ?? val]
    })
    .filter((x) => x != null)

  const newRows = Object.fromEntries(m as any)

  return { ...data, ...newRows } as T
}

export const convertObjectToSQLRow = <
  T extends Record<string, any>,
  R extends Selectable
>(
  objData: Partial<T>
) => {
  const entries = Object.entries(objData)

  const m = entries
    .map((entry) => {
      const [key, val] = entry as [string, T[keyof T]]

      const decamelizeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase()

      return [decamelizeKey, val]
    })
    .filter((x) => x != null)

  const newRows = Object.fromEntries(m as any)

  return newRows as Partial<Row<R> & { data: any }>
}
