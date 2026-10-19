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
3. `backend/supabase/migrations/2026091602_social_post_quotes.sql` adds
   `source_post_id` and its foreign key for reposting Yap posts and replies.
   Apply it before deploying the API: all post creation and deletion operations
   reference this column, including posts without quotes.
4. `backend/supabase/migrations/2026092101_social_post_rich_content.sql` adds
   optional rich-text content and clears stale formatting when older API workers
   edit plain text or delete a post. Deploy this migration, then all API workers,
   then the web UI; older API workers reject the new `richContent` request field.
5. `backend/supabase/migrations/2026101901_social_post_market_comment.sql` adds
   `social_posts.market_comment_id`, `posts.social_post_id` and the indexes
   importance scoring uses. Apply it before deploying the API and scheduler: Yap
   creation, editing, deletion and the importance job all use the columns. Then
   deploy the web UI, since older API workers reject the new `alsoComment`
   request field.

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
- The API keeps one viewer-neutral initial page (10 posts) in memory per instance
  for 30 seconds, combining concurrent cache misses. Authenticated requests add
  only that viewer's liked IDs. Blocked-user feeds, refreshes, pagination, and
  discussion reads bypass the cache; HTTP responses use `no-store`.
- Posts use plain text with automatic links for visible HTTP(S) URLs.
  Typing an emoji shortcode such as `:laugh:` or `:heart:` inserts the emoji.
  Quoting attaches an existing Yap post as a repost card; typed text has no
  rich-text styles, lists, block quotes, or links on arbitrary words.
  Type `@` to select a person or `%` to select a public market. Each post can tag
  ten distinct people and reference five distinct markets inline. The server
  resolves mention IDs to current usernames and public market paths.
  The 2,000-Unicode-code-point limit includes the plain-text form of mentions.
  Existing plain-text posts remain readable and editable.
- Authors can edit posts and replies for 30 minutes after their original posting
  time. Edits do not extend that window. The API enforces the deadline, the Edit
  action disappears at expiry, and an open editor retains its draft with saving
  disabled. Deletion remains available after the edit window ends.
- Avatars and badges show shop cosmetics using the shared `posts` display
  settings and each avatar's native size. Usernames open profile hovercards only
  over the text; surrounding header space opens the Yap discussion. Author and
  liker responses include cosmetic entitlements in their existing queries.
- Holding the heart button for half a second opens the liker list without
  changing the like. Scrolling cancels the hold; regular taps and keyboard
  activation still toggle the like. Clicking the like count also opens the list.
- Posts can attach five distinct public markets and four images.
  Attachments must use the configured Firebase upload bucket;
  reads also hide legacy external image URLs. Image previews stay local until
  the user submits the post.
  Posts and replies may contain only attachments. Closed/resolved markets work.
- Active membership (including the existing renewal grace period) is required
  for creation. Authors retain edit/delete access after membership expires;
  posting bans still prevent creation/editing. Likes and reports need sign-in.
- The timeline contains top-level posts newest first, with two recent direct
  reply previews. It loads 10 posts initially and fetches another 10 as the reader
  approaches the bottom. Reply pages paginate 30 direct children oldest first.
  Cursor timestamps retain microsecond precision, with IDs breaking timestamp ties.
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
  Person tags use the existing mention preference and notify on creation only;
  a parent author who receives a reply notification does not also get a mention.
  Likes use the existing like preference and group by post ID. Notifications are
  in-app only, suppress self/blocked notifications, and do not notify on edits.
- All web market/bet/comment repost actions open the Yap composer. The legacy
  repost API remains available for compatibility with older clients.
- A Yap shared from a market, comment or trade can also post its text and
  images as a market comment (`alsoComment`, on by default in the composer), as
  reposts with text did before Yap. The comment replies in the quoted comment's
  thread, to the quoted trade, or at the top level; it carries `isRepost` and
  `socialPostId` and links back to the Yap. The comment rules (new-account gate,
  mana markets only, the market creator's blocks, comment size) are checked
  before the Yap is written, and the link is written with the Yap. Mentions
  notify through the comment, not the Yap. Yap edits update the comment in the
  same transaction. Authors cannot delete market comments, so deleting their own
  Yap leaves the comment; a moderator removal deletes it too, except comments by
  admins and moderators, which hide-comment also refuses to delete.
- A Yap with a market source writes a `page repost` contract interaction (topic
  interests, conversion score). When it creates a comment, or quotes one the
  repost card may show (no embedded markets or multiple iframes, as before), it
  also writes a legacy `posts` row so the repost reaches followers' Explore
  feeds. The row records its Yap, and deleting the Yap deletes the row. Repost
  feeds skip deleted comments as well as hidden ones.
- Sharing a draft from the market comment box keeps its mentions; links and
  embedded videos, link previews and tweets carry over as visible URLs.
- Importance scoring counts the last day's Yaps per attached market like
  comments, once per non-bot author. A Yap also posted as a comment counts once
  on its source market, through the comment, and still counts on its other
  attached markets.

## API

The typed schema exposes `create-social-post`, `edit-social-post`,
`delete-social-post`, `get-social-posts`, `get-social-post`, and
`get-social-likers`. `react` accepts `contentType: 'social_post'` and likes only.
`report` accepts the same content type and validates the owner on the server.
Social reports appear in the existing user-report queues and can be removed or
dismissed by moderators.

Create/edit content accepts optional `richContent`, a bounded Tiptap JSON document
containing plain paragraphs, line breaks, and mentions. When present, the API derives
`text` from it for notifications and older clients. Reads include both fields and
replace unavailable inline market references with a placeholder. Deletion clears
both fields and removes the post's mention notifications.

The uncached `get-social-post` response includes a separate `editContent` document
only for the live post's author during its edit window. Unavailable mentions remain non-linking atoms
with generic labels in the editor. Saving restores only references already in
the locked stored document, then revalidates length and mention limits; removing
an atom removes that reference. Public posts and shared feed caches never include
this editing document. Mention notifications remain creation-time events after
edits, consistent with comment notifications elsewhere on the site.

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
