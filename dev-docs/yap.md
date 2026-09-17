# Yap

Yap is the shared discussion feed for signed-in users at `/yap`; posts and replies have permanent URLs
at `/yap/[postId]`. It replaces the Explore navigation entry, while `/explore`,
`/feed`, Forum, and their existing data and APIs remain available.

## Deployment

Apply these additive migrations in order before deploying the API and web changes:

1. `backend/supabase/migrations/2026091501_social_posts.sql` creates `social_posts`,
   ordered market associations, database write counters, and social reaction indexes.
2. `backend/supabase/migrations/2026091601_social_post_images.sql` adds image URLs
   and the four-image limit. Post creation requires this column even without images.

The initial migration does not backfill historical reposts. All social-table reads and writes go
through the API; RLS grants no direct client access. Existing `user_reactions`
and `reports` storage is reused.

Deploy the API before the web UI. If the UI needs reverting, leave the additive
schema and API in place to preserve content and links. No production migration
is run by the application or by the development tests.

## Behavior

- Reading the feed, discussions, and liker lists requires sign-in. Logged-out
  page visitors use the site's existing signed-out redirect. The signed-out mobile
  Yap tab opens sign-in. Posts are never
  embedded in public static page props.
- The API keeps one viewer-neutral initial page (30 posts) in memory per instance
  for 30 seconds, combining concurrent cache misses. Authenticated requests add
  only that viewer's liked IDs. Blocked-user feeds, refreshes, pagination, and
  discussion reads bypass the cache; HTTP responses use `no-store`.
- Plain text, up to 2,000 Unicode code points, five distinct public markets, and
  four images. Attachments must use the configured Firebase upload bucket;
  reads also hide legacy external image URLs. Image previews stay local until
  the user submits the post.
  Posts and replies may contain only attachments. Closed/resolved markets work.
- Active membership (including the existing renewal grace period) is required
  for creation. Authors retain edit/delete access after membership expires;
  posting bans still prevent creation/editing. Likes and reports need sign-in.
- The timeline contains top-level posts newest first, with two recent direct
  reply previews. Reply pages paginate direct children oldest first. Cursor
  timestamps retain microsecond precision, with IDs breaking timestamp ties.
- Hourly per-user write limits: 10 posts, 60 replies, 300 like/unlike actions,
  30 edits, and 20 reports. Database counters apply across API instances.
- Block checks cover both immediate parent and root authors. Deleted content is
  cleared, its attachments/likes are removed, and descendants retain placeholders.
  Deleted parents with children remain discoverable in the timeline and reply
  counts, so surviving reply branches can still be opened.
  Deleting a root closes the discussion to new replies. Reports reference current
  content; no edit history or report snapshot is retained.
- Sources and attachments are checked against current visibility on reads.
  Unavailable markets render a placeholder without exposing their details.
- Replies notify the immediate parent author using the new Yap reply preference.
  Likes use the existing like preference and group by post ID. Notifications are
  in-app only, suppress self/blocked notifications, and do not notify on edits.
- All web market/bet/comment repost actions open the plain-text Yap composer.
  New social posts do not create market comments or legacy repost rows. The legacy
  repost API remains available for compatibility with older clients.

## API

The typed schema exposes `create-social-post`, `edit-social-post`,
`delete-social-post`, `get-social-posts`, `get-social-post`, and
`get-social-likers`. `react` accepts `contentType: 'social_post'` and likes only.
`report` accepts the same content type and validates the owner on the server.
Social reports appear in the existing user-report queues and can be removed or
dismissed by moderators.

## Validation

The common and shared Jest suites contain social validation, membership, block,
notification, and rate-limit regression tests. During implementation, an isolated
PostgreSQL runtime also exercised the migration and actual API query paths for
pagination, replies, likes, source visibility, expiry, deletion, and rate limits.
Browser checks use temporary fixtures and mocked API responses, never a live
Manifold write endpoint.

Report screens fetch up to 50 Yap posts by ID through `get-social-posts` in one
request, without ancestors or reply previews. These requests use `forModeration`,
which requires admin/moderator privileges and ignores personal blocks so reports
remain actionable. Deleted content is still omitted. ID lookups bypass the feed cache.
