import { TableName, Row, Column } from 'common/supabase/utils'
import {
  RealtimePostgresInsertPayload,
  RealtimePostgresUpdatePayload,
  RealtimePostgresDeletePayload,
  REALTIME_POSTGRES_CHANGES_LISTEN_EVENT,
  REALTIME_SUBSCRIBE_STATES,
} from '@supabase/realtime-js'

export type Insert<T extends TableName> = RealtimePostgresInsertPayload<Row<T>>
export type Update<T extends TableName> = RealtimePostgresUpdatePayload<Row<T>>
export type Delete<T extends TableName> = RealtimePostgresDeletePayload<Row<T>>
export type Event = `${REALTIME_POSTGRES_CHANGES_LISTEN_EVENT}`
export type EventChangeTypes<T extends TableName> = {
  '*': Insert<T> | Update<T> | Delete<T>
  INSERT: Insert<T>
  UPDATE: Update<T>
  DELETE: Delete<T>
}
export type Change<
  T extends TableName,
  E extends Event = '*'
> = EventChangeTypes<T>[E]

// we could support the other filters that realtime supports rather than just 'eq'
export type Filter<T extends TableName> = { k: Column<T>; v: string | number }
export type SubscriptionStatus = `${REALTIME_SUBSCRIBE_STATES}`

// to work with realtime, the table needs a primary key we can use to identify
// matching rows, and it needs an update timestamp we can use to order changes
export type TableSpec<T extends TableName> = {
  pk: Column<T>[]
  ts?: (row: Row<T>) => number
}

export const REALTIME_TABLES: Partial<{ [T in TableName]: TableSpec<T> }> = {
  posts: {
    pk: ['id'],
  },
  contract_bets: {
    pk: ['contract_id', 'bet_id'],
    ts: (r) => Date.parse(r.fs_updated_time),
  },
  contract_comments: {
    pk: ['contract_id', 'comment_id'],
    ts: (r) => Date.parse(r.fs_updated_time),
  },
  user_notifications: {
    pk: ['user_id', 'notification_id'],
    ts: (r) => Date.parse(r.fs_updated_time),
  },
  contracts: {
    pk: ['id'],
    ts: (r) => Date.parse(r.fs_updated_time),
  },
  group_members: {
    pk: ['group_id', 'member_id'],
    ts: (r) => Date.parse(r.fs_updated_time),
  },
  group_contracts: {
    pk: ['group_id', 'contract_id'],
    ts: (r) => Date.parse(r.fs_updated_time),
  },
}

export function buildFilterString<T extends TableName>(filter: Filter<T>) {
  return `${filter.k}=eq.${filter.v}`
}

export function applyChange<T extends TableName>(
  table: T,
  rows: Row<T>[],
  change: Change<T>
) {
  const spec = REALTIME_TABLES[table]
  if (spec == null) {
    throw new Error('No key and timestamp columns specified for subscription.')
  }
  const identical = (a: Row<T>, b: Row<T>) => {
    return !spec.pk.some((col) => a[col] !== b[col])
  }

  // apply the change to the existing row set, taking into account timestamps.
  // this presumes that when we get new changes, we get them in order, but some
  // prefix of the changes we get may be already reflected in our existing rows.
  switch (change.eventType) {
    case 'INSERT': {
      const existing = rows.find((r) => identical(change.new, r))
      if (existing != null) {
        // this is likely because we established the subscription, got an insert,
        // and then did a fetch that got the same row into the existing set. it
        // should make no difference which one we keep.
        return rows
      }
      return [...rows, change.new]
    }
    case 'UPDATE': {
      const idx = rows.findIndex((r) => identical(change.new, r))
      if (idx == -1) {
        // two possibilities: either this is an out-of-order message that came before
        // its insert (should be impossible?) or they did a custom fetch to only
        // get a subset of data in the subscription loader, and this is an update
        // to something they didn't fetch. either way, do nothing
        return [...rows, change.new]
      }
      if (!spec.ts || spec.ts(rows[idx]) < spec.ts(change.new)) {
        // replace the existing row with the updated row
        return [...rows.slice(0, idx), change.new, ...rows.slice(idx + 1)]
      } else {
        // the updated row is not more recent, so ignore the update
        return rows
      }
    }
    case 'DELETE': {
      // note: the old record only carries the replica identity columns of the table,
      // by default the primary key (but configurable in postgres)
      const idx = rows.findIndex((r) => identical(change.old as Row<T>, r))
      if (idx == -1) {
        // see the note above in the UPDATE clause
        return rows
      }
      return [...rows.slice(0, idx), ...rows.slice(idx + 1)]
    }
    default: {
      console.warn('Unknown change type, ignoring: ', change)
      return rows
    }
  }
}
