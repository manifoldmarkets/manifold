-- Add metadata column to user_entitlements for storing custom data (e.g., selected button text)
alter table user_entitlements
add column if not exists metadata jsonb;
