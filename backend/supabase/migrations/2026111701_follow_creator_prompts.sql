-- The follow-creator prompt (shown after a trade on a creator's markets) is
-- recorded here when the API tells a client to show it, so a second device
-- doesn't show it again. One row per (user, creator), holding the latest
-- prompt: the API allows one prompt per user per 24 hours, and the same
-- creator again only after 30 days (common/src/follow-creator-prompt.ts).
-- Only the API reads and writes it (backend/shared/src/follow-creator-prompt.ts).
-- Run before deploying the API.
create table if not exists
  public.follow_creator_prompts (
    user_id text not null,
    creator_id text not null,
    -- The market whose trade triggered the latest prompt, and the count of
    -- the creator's markets the prompt said the user had traded on.
    contract_id text not null,
    markets_traded integer not null,
    prompted_time timestamptz not null default now(),
    primary key (user_id, creator_id)
  );

alter table public.follow_creator_prompts enable row level security;

revoke all on public.follow_creator_prompts
from
  anon,
  authenticated;
