alter table contracts
add column if not exists home_page_score_adjustment numeric,
add column if not exists home_page_score_adjustment_expires_at timestamp with time zone;
