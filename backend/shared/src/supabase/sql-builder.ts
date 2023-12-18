import { last } from 'lodash'
import { buildArray } from 'common/util/array'
import { pgp } from './init'

export type SqlBuilder = {
  with: string[]
  select: string[]
  from: string | undefined
  join: string[]
  where: string[]
  orderBy: string[]
  limit: number | undefined
  offset: number | undefined
}

export type SqlParts = {
  with?: string
  select?: string
  from?: string
  join?: string
  where?: string
  orderBy?: string
  limit?: number
  offset?: number
}

type Args = (Args | SqlParts | SqlBuilder | undefined | false | 0 | '')[]

export function buildSql(...parts: Args): SqlBuilder {
  const definedParts = buildArray(parts)

  return {
    with: definedParts.flatMap((part) => part.with || []),
    select: definedParts.flatMap((part) => part.select || []),
    from: last(definedParts.filter((part) => part.from))?.from,
    join: definedParts.flatMap((part) => part.join || []),
    where: definedParts.flatMap((part) => part.where || []),
    orderBy: definedParts.flatMap((part) => part.orderBy || []),
    limit: last(definedParts.filter((part) => part.limit))?.limit,
    offset: last(definedParts.filter((part) => part.offset))?.offset,
  }
}

export function withClause(clause: string) {
  return buildSql({ with: clause })
}

export function select(clause: string) {
  return buildSql({ select: clause })
}

export function from(clause: string) {
  return buildSql({ from: clause })
}

export function join(clause: string) {
  return buildSql({ join: clause })
}

export function where(clause: string, formatValues?: any) {
  const where = pgp.as.format(clause, formatValues)
  return buildSql({ where })
}

export function orderBy(clause: string, formatValues?: any) {
  const orderBy = pgp.as.format(clause, formatValues)
  return buildSql({ orderBy })
}

export function limit(limit: number, offset?: number) {
  return buildSql({ limit, offset })
}

export function renderSql(...args: Args) {
  const builder = buildSql(...args)

  const {
    with: withClause,
    select,
    from,
    join,
    where,
    orderBy,
    limit,
    offset,
  } = builder
  return buildArray(
    withClause.length && `with ${withClause.join(', ')}`,
    select.length && `select ${select.join(', ')}`,
    from && `from ${from}`,
    join.length && `join ${join.join(' join ')}`,
    where.length &&
      `where ${where.map((clause) => `(${clause})`).join(' and ')}`,
    orderBy.length && `order by ${orderBy.join(', ')}`,
    limit && `limit ${limit}`,
    limit && offset && `offset ${offset}`
  ).join('\n')
}
