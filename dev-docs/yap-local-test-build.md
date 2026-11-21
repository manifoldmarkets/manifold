# Combined Yap local test build

Branch: codex/yap-combined-local-20261111
Base main: bc37d48fa26c3f9bec56071cdb1cda1bb0520910
PR 4182: fc6ab62fda36be3d9bbeeb2558ad46b9a121c59e
PR 4255: 9eb0caaef5d4a66d5aca0e305ba4316c28291cac

## Running

From this checkout, in two terminals:

```sh
node scripts/yap-dev.cjs api
node scripts/yap-dev.cjs web
```

Open http://localhost:3000/yap and sign in using DEV credentials. API: http://localhost:8088.
This is a local web/API with shared DEV Firebase and database. Docker is not required.
The launcher uses the existing DEV service-account file (override its path with YAP_DEV_CREDENTIALS), checks the project, isolates Firebase CLI project selection under .local-yap/config, and removes inherited deployment/local-only/debugger settings. No credential contents are committed. API runs through ts-node in transpile-only mode to avoid memory-heavy watchers; this is not a replacement for typechecking.

## DEV migration

Applied only backend/supabase/migrations/2026103002_social_post_market_comment.sql to DEV on 2026-11-11. It adds nullable social_posts.market_comment_id, posts.social_post_id and indexes. No production deployment or database changes.
Read-only check: node scripts/yap-dev.cjs check-db
The optional --apply-migration flag applies that one migration if the two columns are missing.

## Review and validation

Resolved the create-comment.ts merge conflict by keeping the mod flag, assigned comment IDs, social-post linkage and transaction argument.
HTTP checks: /yap returns 200; local API /v0/markets?limit=1 returns 200 with DEV data; unauthenticated /get-social-posts requires authentication.
Browser-control connection failed, so no signed-in browser pass is claimed.
Earlier Jest/typecheck attempts failed from host memory exhaustion (and an incomplete dependency copy). They are not passing results. The root and workspace-specific dependencies have subsequently been copied.

Follow-up changes on 2026-11-12:
- Replies with their own market attachments intentionally count toward ranking.
- Creators' own Yaps and market comments are excluded from their market's discussion score, including mirrored comments. Likes/trades retain their existing weights. This scoring code runs in the scheduler; the local web/API alone does not run that job.
- Mod-comment mode disables Post to Yap, with an explanation on hover and a submission guard. Turn the mode off to share normally.
- Sending a draft from a market comment reply box to Yap now retains its original comment-thread reference.
- Grouped re-Yaps with shared discussion remain a design proposal, not implemented.
Follow-up validation: all 21 tests in importance-score.test.ts and social-cross-post.test.ts pass. Focused ESLint checks pass. The actual discussion queries also pass against isolated temporary SQL fixtures in a rolled-back DEV transaction, including creator exclusion, mirrors, repeated shares and reply attachments. The local market page and API both return HTTP 200. Signed-in UI acceptance testing remains outstanding.

This branch is for acceptance testing, not merge approval.

## Manual checks

- Share a market with also-comment on: one Yap and one top-level market comment.
- Share a comment: reply in the original market thread. Share a trade: reply to the trade.
- Start a reply in a market comment thread, then Post to Yap: the mirrored comment must remain in that original thread.
- Turn also-comment off: Yap only, and preserve mentions/links from the original composer.
- Edit the Yap and verify its linked comment updates.
- Delete your Yap: the market comment remains and its repost disappears.
- Moderator removal: associated comment is removed, except protected admin/mod comments.
- Verify follower Explore reposts and direct mod-comment labels/reset/cancel behaviour.
- Toggle mod-comment mode on: Post to Yap must be disabled. Toggle it off: sharing is available again.

Runtime logs are in .local-yap (ignored). The original checkout was not edited and this branch was not pushed.
