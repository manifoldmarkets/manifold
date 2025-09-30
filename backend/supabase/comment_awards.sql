create table if not exists
  public.comment_awards (
    id bigint primary key generated always as identity,
    comment_id text not null,
    contract_id text not null,
    giver_user_id text not null,
    receiver_user_id text not null,
    award_type text not null check (award_type in ('plus', 'premium', 'crystal')),
    amount_mana bigint not null,
    created_time timestamptz not null default now()
  );

create index if not exists comment_awards_comment_idx on public.comment_awards (comment_id);

create index if not exists comment_awards_receiver_idx on public.comment_awards (receiver_user_id);
