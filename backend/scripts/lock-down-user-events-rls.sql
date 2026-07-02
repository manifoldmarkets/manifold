-- Lock down user_events INSERT RLS so client-side analytics writes can't
-- forge a different user_id.
--
-- The previous policy was `with check (true)`, which allowed any caller
-- holding the public anon key to insert rows with any user_id (and any
-- name/data). This let unauthenticated/authenticated clients impersonate
-- arbitrary users in event analytics, pollute admin journey reports, and
-- inject arbitrary JSONB.
--
-- New policy:
--   * Authenticated callers (firebase_uid() is a uid): may insert only rows
--     where user_id = firebase_uid().
--   * Anonymous callers (firebase_uid() is null): may insert only rows where
--     user_id is null. (`is not distinct from` treats NULL = NULL as true.)
--
-- This preserves the existing legitimate analytics paths in
-- web/lib/service/analytics.ts, which always set user_id to either
-- auth.currentUser?.uid or undefined/null.

drop policy if exists "user can insert" on user_events;
drop policy if exists "user can insert own events" on user_events;

create policy "user can insert own events" on user_events for insert
with
  check (user_id is not distinct from firebase_uid ());
