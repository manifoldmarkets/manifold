-- User cosmetic/digital entitlements
create table if not exists
  public.user_entitlements (
    user_id text not null,
    entitlement_id text not null,
    granted_time timestamptz not null default now(),
    expires_time timestamptz null,
    metadata jsonb null,
    primary key (user_id, entitlement_id)
  );

create index if not exists user_entitlements_user_idx on public.user_entitlements (user_id);
