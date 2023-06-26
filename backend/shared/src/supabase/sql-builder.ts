import { last } from 'lodash'
import { buildArray, filterDefined } from 'common/util/array'
import { pgp } from './init'

export type SqlBuilder = {
  with: string[]
  select: string[]
  from: string[]
  join: string[]
  where: string[]
  orderBy: string[]
  limit: string | undefined
}

export type SqlParts = {
  with?: string
  select?: string
  from?: string
  join?: string
  where?: string
  orderBy?: string
  limit?: string
}

export function buildSql(
  ...parts: (SqlParts | SqlBuilder | undefined)[]
): SqlBuilder {
  const definedParts = filterDefined(parts)
  return {
    with: ([] as string[]).concat(
      ...definedParts.map((part) => part.with || [])
    ),
    select: ([] as string[]).concat(
      ...definedParts.map((part) => part.select || [])
    ),
    from: ([] as string[]).concat(
      ...definedParts.map((part) => part.from || [])
    ),
    join: ([] as string[]).concat(
      ...definedParts.map((part) => part.join || [])
    ),
    where: ([] as string[]).concat(
      ...definedParts.map((part) => part.where || [])
    ),
    orderBy: ([] as string[]).concat(
      ...definedParts.map((part) => part.orderBy || [])
    ),
    limit: last(definedParts.map((part) => part.limit)),
  }
}

export function renderSql(builder: SqlBuilder) {
  const {
    with: withClause,
    select,
    from,
    join,
    where,
    orderBy,
    limit,
  } = builder
  return buildArray(
    withClause.length && `with ${withClause.join(', ')}`,
    select.length && `select ${select.join(', ')}`,
    from.length && `from ${from.join(', ')}`,
    join.length && `join ${join.join(' join ')}`,
    where.length && `where ${where.join(' and ')}`,
    orderBy.length && `order by ${orderBy.join(', ')}`,
    limit && `limit ${limit}`
  ).join('\n')
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

export function orderBy(clause: string) {
  return buildSql({ orderBy: clause })
}
