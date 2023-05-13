import { TableName, Row, Column } from 'common/supabase/utils'
import {
  RealtimePostgresChangesPayload,
  REALTIME_SUBSCRIBE_STATES
} from '@supabase/realtime-js'

// we could support the other filters that realtime supports rather than just 'eq'
export type Filter<T extends TableName> = { k: Column<T>; v: string | number }
export type Change<T extends TableName> = RealtimePostgresChangesPayload<Row<T>>
export type SubscriptionStatus = `${REALTIME_SUBSCRIBE_STATES}`

// to work with realtime, the table needs a primary key we can use to identify
// matching rows, and it needs an update timestamp we can use to order changes
export type TableSpec<T extends TableName> = {
  pk: Column<T>[],
  ts: (row: Row<T>) => number,
}

export const REALTIME_TABLES: Partial<{ [T in TableName]: TableSpec<T> }> = {
  contract_bets: {
    pk: ['contract_id', 'bet_id'],
    ts: (r) => parseInt(r.fs_updated_time)
  }
}

export function buildFilterString<T extends TableName>(filter: Filter<T>) {
  return `${filter.k}=${filter.v}`
}

export function applyChange<T extends TableName>(
  table: T,
  rows: Row<T>[],
  change: Change<T>
) {
  const spec = REALTIME_TABLES[table]
  if (spec == null) {
    throw new Error("No key and timestamp columns specified for subscription.")
  }
  const identical = (a: Row<T>, b: Row<T>) => {
    return !spec.pk.some((col) => a[col] !== b[col])
  }

  // apply the change to the existing row set, taking into account timestamps.
  // this presumes that when we get new changes, we get them in order, but some
  // prefix of the changes we get may be already reflected in our existing rows.
  switch (change.eventType)  {
    case "INSERT": {
      const existing = rows.find(r => identical(change.new, r))
      if (existing != null) {
        console.warn("Out-of-order subscription insert: ", change)
        return rows
      }
      return [...rows, change.new]
    }
    case "UPDATE": {
      const idx = rows.findIndex(r => identical(change.new, r))
      if (idx == -1) {
        console.warn("Out-of-order subscription update: ", change)
        return [...rows, change.new]
      }
      if (spec.ts(rows[idx]) < spec.ts(change.new)) {
        // replace the existing row with the updated row
        return [...rows.slice(0, idx), change.new, ...rows.slice(idx)]
      } else {
        // the updated row is not more recent, so ignore the update
        return rows
      }
    }
    case "DELETE": {
      // note: the old record only carries the replica identity columns of the table,
      // by default the primary key (but configurable in postgres)
      const idx = rows.findIndex(r => identical(change.old as Row<T>, r))
      if (idx == -1) {
        console.warn("Out-of-order subscription delete: ", change)
        return rows
      }
      return [...rows.slice(0, idx), ...rows.slice(idx)]
    }
    default: {
      console.warn('Unknown change type, ignoring: ', change)
      return rows
    }
  }
}
