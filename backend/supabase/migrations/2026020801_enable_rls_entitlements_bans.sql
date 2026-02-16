-- Enable RLS on user_entitlements and user_bans tables
-- Backend uses createSupabaseDirectClient() which bypasses RLS
-- Frontend needs read access to entitlements for displaying hats/accessories

alter table user_entitlements enable row level security;
alter table user_bans enable row level security;

-- Allow public reads on entitlements (needed for frontend to display hats, etc.)
create policy "public read" on user_entitlements for select using (true);

-- No policies on user_bans - only backend (which bypasses RLS) needs access