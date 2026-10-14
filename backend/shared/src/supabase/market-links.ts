import { LinkParentCandidate, MarketLinkRelation } from 'common/market-links'
import { tsToMillis } from 'common/supabase/utils'
import { SupabaseDirectClient, SupabaseTransaction } from './init'

/**
 * Serialize graph mutations touching these existing markets. Lock before
 * reading link state, and keep the locks through the write in the same tx.
 * The stable order prevents opposing links from taking locks in reverse.
 * NO KEY UPDATE also blocks close/visibility/resolution changes without
 * conflicting with the foreign-key checks performed by unrelated inserts.
 */
export async function lockMarketLinkContracts(
  tx: SupabaseTransaction,
  contractIds: string[]
) {
  await tx.manyOrNone(
    `select id from contracts
     where id = any($1::text[])
     order by id
     for no key update`,
    [contractIds]
  )
}

/**
 * Creation holds its parent lock before touching the payer. Resolution takes
 * those locks in the opposite order, so never wait for the payer while holding
 * the parent: the caller can roll back and retry before any writes occur.
 */
export async function lockMarketLinkFundingUser(
  tx: SupabaseTransaction,
  userId: string
) {
  await tx.oneOrNone(
    `select id from users where id = $1 for no key update nowait`,
    [userId]
  )
}

/** A would-be parent, with what getLinkParentError checks. */
export async function getLinkParentCandidate(
  pg: SupabaseDirectClient,
  parentId: string
): Promise<LinkParentCandidate | null> {
  const row = await pg.oneOrNone<{
    id: string
    visibility: string | null
    deleted: boolean | null
    resolution: string | null
    close_time: string | null
    is_child: boolean
  }>(
    `select c.id, c.visibility, c.deleted, c.resolution, c.close_time,
       exists (select 1 from market_links l where l.child_contract_id = c.id)
         as is_child
     from contracts c
     where c.id = $1`,
    [parentId]
  )
  if (!row) return null
  return {
    id: row.id,
    visibility: row.visibility ?? 'public',
    deleted: !!row.deleted,
    isResolved: row.resolution != null,
    closeTime: row.close_time ? tsToMillis(row.close_time) : null,
    isChild: row.is_child,
  }
}

/** How many markets are linked to this one. */
export async function getLinkedChildCount(
  pg: SupabaseDirectClient,
  contractId: string
) {
  const row = await pg.one<{ count: number }>(
    `select count(*)::int as count from market_links where parent_contract_id = $1`,
    [contractId]
  )
  return row.count
}

/** Links a child after locking and validating it and its parent in this tx. */
export async function upsertMarketLink(
  pg: SupabaseTransaction,
  link: {
    childId: string
    parentId: string
    relation: MarketLinkRelation
    createdBy: string
  }
) {
  await pg.none(
    `insert into market_links
       (child_contract_id, parent_contract_id, relation, created_by)
     values ($1, $2, $3, $4)
     on conflict (child_contract_id) do update set
       parent_contract_id = excluded.parent_contract_id,
       relation = excluded.relation,
       created_by = excluded.created_by,
       created_time = now()`,
    [link.childId, link.parentId, link.relation, link.createdBy]
  )
}

export async function deleteMarketLink(
  pg: SupabaseDirectClient,
  childId: string,
  authorizedParentId: string
) {
  // A concurrent reparent must not let the previous parent's owner remove
  // the replacement link. PostgreSQL rechecks this predicate after waiting
  // for a concurrent update of the same row.
  await pg.none(
    `delete from market_links
     where child_contract_id = $1 and parent_contract_id = $2`,
    [childId, authorizedParentId]
  )
}

export async function getMarketLinkParent(
  pg: SupabaseDirectClient,
  childId: string
) {
  return await pg.oneOrNone<{
    parent_contract_id: string
    relation: MarketLinkRelation
  }>(
    `select parent_contract_id, relation from market_links
     where child_contract_id = $1`,
    [childId]
  )
}

/** Which of `ids` are linked to some market. */
export async function getIdsWithParents(
  pg: SupabaseDirectClient,
  ids: string[]
): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const rows = await pg.manyOrNone<{ id: string }>(
    `select child_contract_id as id from market_links
     where child_contract_id = any($1)`,
    [ids]
  )
  return new Set(rows.map((r) => r.id))
}

export type LinkedChild = {
  id: string
  parentId: string
  relation: MarketLinkRelation
}

/**
 * The public, undeleted markets linked to any of `parentIds`, most important
 * first within each parent.
 */
export async function getLinkedChildren(
  pg: SupabaseDirectClient,
  parentIds: string[]
): Promise<LinkedChild[]> {
  if (parentIds.length === 0) return []
  const rows = await pg.manyOrNone<{
    id: string
    parent_id: string
    relation: MarketLinkRelation
  }>(
    `select l.child_contract_id as id, l.parent_contract_id as parent_id,
       l.relation
     from market_links l
     join contracts c on c.id = l.child_contract_id
     where l.parent_contract_id = any($1)
       and c.visibility = 'public'
       and not coalesce(c.deleted, false)
     order by l.parent_contract_id, c.importance_score desc, c.id`,
    [parentIds]
  )
  return rows.map((r) => ({
    id: r.id,
    parentId: r.parent_id,
    relation: r.relation,
  }))
}
