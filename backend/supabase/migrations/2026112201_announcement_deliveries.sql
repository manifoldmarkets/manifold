begin;

-- One row per announcement post: how far its send to every user has got.
--
-- WHY THIS EXISTS
--
-- An announcement notifies every user (~208k on 2026-11-22). The API used to
-- do it in one go after create-post responded: load every user id, build
-- every notification in memory, and insert them 25,000 rows at a time with
-- `returning *`. Nothing recorded progress and nothing retried. Since the
-- API's 60 second statement cap (#3893, June 2026) a 25,000-row insert has
-- sometimes run past it, and the send stopped where it failed, silently:
-- the error carried the multi-megabyte insert and never reached the logs.
-- Measured on prod 2026-11-22 from samples of 300 users: the Jul 1 and Nov 3
-- changelogs reached ~12% of users (the first batch), and the Nov 22
-- changelog reached none.
--
-- Now create-post writes this row in the post's own transaction, and
-- shared/notifications/announcement-delivery.ts sends 1,000 users per
-- transaction in user id order. Each batch's notifications and the cursor
-- below commit together, so a send that dies resumes where it stopped and no
-- user is sent it twice. The scheduler's resume-announcement-deliveries job
-- picks up any send that has stopped moving.
create table if not exists announcement_deliveries (
  post_id text primary key,
  -- When the announcement was queued. Every user's notification carries it as
  -- createdTime, so a send that resumed later still reads as one moment.
  created_time timestamptz not null default now(),
  -- Users are sent to in id order. The last id sent; null before the first
  -- batch.
  last_user_id text,
  sent_count int not null default 0,
  -- Set when no user is left to send to.
  finished_time timestamptz,
  -- Bumped by every batch and every failure. A send not finished and not
  -- touched for a few minutes has stopped, and the resume job takes it up.
  updated_time timestamptz not null default now(),
  -- The last batch failure, kept until the next batch commits.
  last_error text
);

alter table announcement_deliveries enable row level security;

create index if not exists announcement_deliveries_unfinished
  on announcement_deliveries (updated_time)
  where finished_time is null;

commit;
