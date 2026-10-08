jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
}))
jest.mock('shared/utils', () => ({ log: { error: jest.fn() } }))
jest.mock('shared/websockets/server', () => ({ broadcast: jest.fn() }))
jest.mock('shared/websockets/helpers', () => ({
  broadcastUpdatedPrivateUser: jest.fn(),
}))
jest.mock('shared/supabase/users', () => ({ updatePrivateUser: jest.fn() }))
jest.mock('shared/create-push-notifications', () => ({
  createPushNotifications: jest.fn().mockResolvedValue(undefined),
}))

import { readFileSync } from 'fs'
import { resolve } from 'path'
import * as pgPromise from 'pg-promise'
import { getDefaultNotificationPreferences } from 'common/user-notification-preferences'
import { sendPerpPositionAlertsForUser } from './perp-position-alerts'
import { createSupabaseDirectClient } from 'shared/supabase/init'
// Keep API sources outside the shared package's composite build root while
// exercising the real handler (its infrastructure imports remain mocked).
const { updateNotifSettings } = jest.requireActual<{
  updateNotifSettings: (
    props: { type: string; medium: string; enabled: boolean },
    auth: { uid: string },
    req: unknown
  ) => Promise<unknown>
}>('../../../api/src/update-notif-settings')

const url = process.env.PERP_ALERT_TEST_DATABASE_URL
// This suite creates fixture tables. Only permit an explicitly named local
// disposable database, never a deployed Manifold database.
if (url) {
  const parsed = new URL(url)
  if (
    !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
    parsed.pathname !== '/perp_alert_test'
  ) {
    throw new Error(
      'PERP_ALERT_TEST_DATABASE_URL must point to local /perp_alert_test'
    )
  }
}
const integration = url ? describe : describe.skip

integration('perp alerts in PostgreSQL', () => {
  const pgp = pgPromise()
  const pg = url ? pgp(url) : undefined!
  const now = Date.now()
  beforeAll(async () => {
    await pg.none(`
      do $$ begin
        if not exists (select from pg_roles where rolname = 'anon') then create role anon; end if;
        if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      end $$;
      create table if not exists users (id text primary key);
      create table if not exists private_users (id text primary key, data jsonb not null);
      create table if not exists contracts (id text primary key, mechanism text, resolution_time timestamptz, data jsonb);
      create table if not exists contract_perp_positions (
        contract_id text, user_id text, direction text, size numeric,
        cost_basis numeric, original_cost_basis numeric, taker_fee_cost_basis numeric,
        entry_price numeric, leverage numeric, liquidation_price numeric,
        opened_time timestamptz, updated_time timestamptz
      );
      create table if not exists user_notifications (user_id text, notification_id text, data jsonb,
        primary key (user_id, notification_id));
    `)
    const migration = readFileSync(
      resolve(
        __dirname,
        '../../../supabase/migrations/2026091201_perp_alert_states.sql'
      ),
      'utf8'
    )
    await pg.none(migration)
    await pg.none(migration) // Migration is safe to reapply.
  })
  afterAll(() => pgp.end())
  beforeEach(async () => {
    jest.clearAllMocks()
    await pg.none(
      `truncate users, private_users, contracts, contract_perp_positions, user_notifications, perp_alert_states cascade`
    )
    await pg.none(
      `insert into users values ('u'); insert into private_users values ('u', $1)`,
      [
        {
          id: 'u',
          notificationPreferences: getDefaultNotificationPreferences(),
        },
      ]
    )
    await pg.none(`insert into contracts values ('c', 'perp', null, $1)`, [
      {
        id: 'c',
        mechanism: 'perp',
        oraclePrice: 100,
        oraclePriceTime: now,
        maxOraclePriceAgeMs: 3600000,
        question: 'Test market',
        slug: 'test',
        creatorName: 'Creator',
        creatorUsername: 'creator',
        oracleFeedId: 'test',
      },
    ])
    await pg.none(
      `insert into contract_perp_positions values ('c', 'u', 'long', 1000, 100, 100, 0, 100, 10, 90, now(), now())`
    )
    jest.mocked(createSupabaseDirectClient).mockReturnValue(pg)
  })

  it('restricts state to the backend', async () => {
    expect(
      await pg.one(
        `select relrowsecurity from pg_class where oid = 'perp_alert_states'::regclass`
      )
    ).toEqual({ relrowsecurity: true })
    for (const role of ['anon', 'authenticated']) {
      expect(
        await pg.one(
          `select has_table_privilege($1, 'perp_alert_states', 'select,insert,update,delete') as allowed`,
          [role]
        )
      ).toEqual({ allowed: false })
    }
  })

  it('serializes eight concurrent scans into exactly one notification', async () => {
    await sendPerpPositionAlertsForUser(pg, 'u')
    await pg.none(
      `update contracts set data = jsonb_set(data, '{oraclePrice}', '110')`
    )
    await Promise.all(
      Array.from({ length: 8 }, () => sendPerpPositionAlertsForUser(pg, 'u'))
    )
    expect(
      await pg.one(`select count(*)::int as count from user_notifications`)
    ).toEqual({ count: 1 })
    expect(
      await pg.one(
        `select (data->'positions'->'c:long'->>'profit')::int as profit from perp_alert_states`
      )
    ).toEqual({ profit: 100 })
  })

  it('rolls back notification insertion if persisting state fails and permits retry', async () => {
    await sendPerpPositionAlertsForUser(pg, 'u')
    await pg.none(
      `update contracts set data = jsonb_set(data, '{oraclePrice}', '110')`
    )
    await pg.none(`create function reject_alert_state() returns trigger language plpgsql as $$ begin raise exception 'test rollback'; end $$;
      create trigger reject_alert_state before update on perp_alert_states for each row execute function reject_alert_state()`)
    try {
      await expect(sendPerpPositionAlertsForUser(pg, 'u')).rejects.toThrow(
        'test rollback'
      )
      expect(
        await pg.one(`select count(*)::int as count from user_notifications`)
      ).toEqual({ count: 0 })
    } finally {
      await pg.none(
        `drop trigger reject_alert_state on perp_alert_states; drop function reject_alert_state()`
      )
    }
    await sendPerpPositionAlertsForUser(pg, 'u')
    expect(
      await pg.one(`select count(*)::int as count from user_notifications`)
    ).toEqual({ count: 1 })
  })

  it('preserves the web default when disabling mobile on a previously absent preference', async () => {
    await pg.none(
      `update private_users set data = data #- '{notificationPreferences,perp_liquidation_warning}'`
    )
    await updateNotifSettings(
      { type: 'perp_liquidation_warning', medium: 'mobile', enabled: false },
      { uid: 'u' },
      {}
    )
    expect(
      await pg.one(
        `select data->'notificationPreferences'->'perp_liquidation_warning' as destinations from private_users`
      )
    ).toEqual({ destinations: ['browser'] })
    await updateNotifSettings(
      { type: 'perp_liquidation_warning', medium: 'browser', enabled: false },
      { uid: 'u' },
      {}
    )
    expect(
      await pg.one(
        `select data->'notificationPreferences'->'perp_liquidation_warning' as destinations from private_users`
      )
    ).toEqual({ destinations: [] })
  })
})
