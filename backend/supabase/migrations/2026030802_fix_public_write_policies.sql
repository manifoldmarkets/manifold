-- Fix tables that had "for all using (true)" which grants public INSERT/UPDATE/DELETE.
-- private_user_message_channels and scheduler_info become backend-only (no policies).
-- chart_annotations, love_questions, lover_comments become read-only.

-- 1. private_user_message_channels: remove all-access policy entirely (backend-only)
drop policy if exists "public read" on private_user_message_channels;

-- 2. scheduler_info: remove all-access policy entirely (backend-only)
drop policy if exists "public read" on scheduler_info;

-- 3. chart_annotations: replace all-access with read-only
drop policy if exists "public read" on chart_annotations;
create policy "public read" on chart_annotations for select using (true);

-- 4. love_questions: replace all-access with read-only
drop policy if exists "public read" on love_questions;
create policy "public read" on love_questions for select using (true);

-- 5. lover_comments: replace all-access with read-only
drop policy if exists "public read" on lover_comments;
create policy "public read" on lover_comments for select using (true);
