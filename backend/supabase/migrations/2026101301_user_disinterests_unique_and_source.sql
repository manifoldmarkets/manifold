begin;

-- "Uninterested" was append-only: every click inserted another row, the undo
-- path matched on a feed_id the web never sent, and feeds only ever hid the
-- exact market. This gives the table the shape the feature needs:
--
--  * one row per (user, market), so a second click can be an undo instead of
--    a duplicate (2,931 of 21,381 rows were duplicates when this was written);
--  * source_contract_id, null on a market the user marked themselves and set
--    to that marked market on rows the system derived from it (near-identical
--    questions, including ones created later), so undoing a mark can take its
--    derived rows with it and undoing something else cannot.

-- Keep the oldest row of each duplicated pair.
delete from user_disinterests a
using user_disinterests b
where a.user_id = b.user_id
  and a.contract_id = b.contract_id
  and a.id > b.id;

alter table user_disinterests
  add column if not exists source_contract_id text;

comment on column user_disinterests.source_contract_id is
  'Null when the user marked this market themselves; otherwise the marked market this hide was derived from as a near-identical question.';

create unique index if not exists user_disinterests_user_id_contract_id_unique
  on user_disinterests (user_id, contract_id);

-- Superseded by the unique index on the same columns.
drop index if exists user_disinterests_user_id_contract_id;

-- Undo removes a mark together with everything derived from it.
create index if not exists user_disinterests_user_id_source_contract_id
  on user_disinterests (user_id, source_contract_id)
  where source_contract_id is not null;

commit;
