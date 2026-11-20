# Yap shared discussions and re-Yaps

Combined implementation, updated 18 November 2026. No production deployment.

## Behaviour

- Re-Yap shares a stable original item. One active share per person; undo does not delete content. Re-sharing can bump it at most once per 24 hours, including undo/re-add cycles.
- Quote creates a distinct authored post. Unrelated takes that link the same market stay separate. When the original can no longer be shown on Yap (removed, taken off Yap, hidden, or behind a block), the quote shows "Original post unavailable." with no author, no text and no link. A quoted comment or trade is treated as a quoted Yap is. This covers the quote box only: a removed post's own place in its thread still names its author, as it did before this work.
- A market comment and its Yap post are one message with one set of likes, and replies made on either side appear on both. The market comment is the record: it is written, edited and stored under the market's rules. Yap shows a copy of it, cut to what Yap's format holds (paragraphs, mentions, visible links, up to four images, 2,000 characters).
- Commenting on a market never depends on Yap. A comment is saved as written first; if its thread, trade or market has a Yap discussion that still takes messages, it then joins that discussion as a copy. Likes made on the market are the market's own reactions, which Yap reads.
- Editing: the author or an admin, with no time limit, on the market. On Yap the same people can edit a post that has a market comment, unless the comment has formatting Yap cannot hold; that one is edited on its market. Standalone Yaps keep the 30-minute window.
- Removing: an author who removes their post takes it off Yap only. Their market comment stays, because authors cannot delete market comments, and it is not copied to Yap again. A moderator's removal deletes both, under the market's rules: not a comment by an admin or moderator, and not while banned from moderating comments.
- Hiding: a market creator's hide collapses the comment on their market and does not reach Yap. An admin's or moderator's hide also hides the post on Yap, and their unhide restores it.
- Mod comments stay on their market: they cannot be re-Yapped, quoted or copied to Yap.
- Replies use normal commenting eligibility; publishing and re-Yapping require membership. Public discussions can be read while signed out. A read adds at most 100 of a market's older comments to its discussion, skips any it cannot place, and never fails because of one. Comments that can never join are not picked up at all, so they do not use up a read: those on a market that is no longer public, and those whose author has a block with the author of the post being read, of its thread or of the market.
- A comment shared before its market or trade keeps its original discussion and subscribers. The market and trade cards can list that comment without moving its thread. A trade reply joins the market discussion when the trade has no card of its own.
- Posting or replying on Yap, or choosing Follow, makes you follow that thread. Mute and unmute apply to that thread's Yap alert and to nothing else: the market's own alerts follow the market's settings, whether the Yap thread is muted or not. Commenting on a market does not make you follow: when a market comment is copied into a Yap discussion, by a read, by someone else's share or because its author just wrote it, the author's notifications stay as the market sends them. Re-Yap notifications aggregate for the original author.
- Explore includes native Yap cards. Shared market/comment/trade items have stable identities even when shared without commentary.
- Ranking counts independent people across comments, Yaps and re-Yaps, excluding market creators and bots. Mirroring and repeated shares cannot multiply the signal.

## Implementation checkpoints

- [x] Additive schema and shared types
- [x] Stable sources, reply/edit/moderation bridge and shared reactions
- [x] Re-Yap/undo/cooldown and thread subscriptions
- [x] Timeline and Explore integration
- [x] Public reading and reply eligibility
- [x] Ranking deduplication and creator freshness exclusion
- [x] Focused regression checks, DEV migration and local restart

Existing source content and authorship must be preserved. No destructive backfill or automatic merging of independently authored quote posts.

## Local testing

Open http://localhost:3000/yap. The local API is http://localhost:8088 and uses DEV Firebase and the DEV database.

1. Re-Yap the same post from two accounts: one feed item, original author retained, two shares and one discussion. Undo one share; the original and replies remain. Undo/re-add within 24 hours does not advance its bump time.
2. Quote the post with your own text: a separate authored post and conversation, linked to the original.
3. Share a market comment, reply from Yap, then reply from the market. Check placement and shared likes. Edit the comment on the market with bold text and a list: the market keeps the formatting, Yap shows the plain copy, and Yap's Edit sends you back to the market. Remove your own post on Yap: the comment stays on the market. Hide a shared comment as the market's creator: it collapses on the market and stays on Yap. Hide it as a moderator: it goes from both. Standalone Yaps retain the 30-minute edit window.
4. Follow/mute/unmute the thread from the Yap menu. Participants get one grouped in-app alert for replies instead of the market's in-app alert; email and push still follow their market preferences. Muting the thread stops the grouped Yap alert and nothing else: someone who also follows the market then gets the market's own alerts again, on the channels their market settings allow. Other market followers retain their existing notifications.
5. Look at Explore for native Yap cards. Open a Yap URL while signed out. Confirm moderator-comment mode and Post to Yap remain mutually exclusive.

The count shows active unique sharers. Re-Yapping does not create a new authored post or silently subscribe the sharer to replies. Quotes remain separate, even when they refer to the same market.

## Verification

- 98 focused tests passed after integrating main on 18 November: 89 backend/shared tests across social posting, rich content, shared edit/deletion, public access, mentions, ranking, notifications and comment continuations; 9 common rich-content conversion tests.
- API source typecheck and full web typecheck passed. Changed-file ESLint: no errors (one existing unused-argument warning in notification UI).
- `node scripts/yap-regressions.cjs` executes the actual handlers/SQL against temporary tables on DEV and rolls back. Covers migration/like deduplication, unique/reversible shares, cooldown, thread mutes, stable native comment identity, moderation, creator exclusions and distinct-participant ranking. No test notifications are sent.
- DEV migration applied. Public Yap feed, detail and unified Explore API returned HTTP 200; /yap compiled and returned HTTP 200.
- No signed-in visual walkthrough has been performed. The flows above are the manual acceptance pass.
- Review fixes, 19 November (not yet on DEV): the rules under Behaviour for market commenting, editing, removing, hiding, mod comments and bounded reads. `backend/shared/src/social-discussion.test.ts` runs the linking helpers and the two Yap migrations on an in-memory PostgreSQL built from the repository's own migration files, and `market-comment-endpoints.test.ts` covers the market endpoints. `scripts/yap-regressions.cjs` gained the cases the migration must leave alone, and takes `YAP_REGRESSION_DATABASE_URL` to run against a local database instead of DEV.
- The current reaction backfill keeps the latest vote per affected voter, preserves the winning reaction ID and leaves unmatched Yap likes in place. Environments that used an earlier version need their data checked before rollout. Replaying the SQL can reconcile surviving rows. Recovering previously discarded rows requires an earlier snapshot.
- Second review round, 19 November (not yet on DEV). A copied comment no longer makes its author follow the thread, and the migration's follow backfill skips cards and copies, so replaying it does not add those follows either. Builds before this wrote a follow for every copied comment; DEV has such rows and they cannot be told apart from a chosen Follow, while production has none because none of this was deployed there. The reply count is now three indexed counts instead of one condition that read the whole posts table for every post shown. `social-discussion.test.ts` covers both, the second by checking the statement's plan.
- Third review round, 20 November (not yet on DEV), on Tod's decisions. Muting a Yap thread no longer silences the market: before, a muted follower got none of that market's comment alerts on any channel, a creator's "needs response" included. A read no longer picks up comments that can never join, which on a market with 100 or more of them emptied the first page of every fresh read. A quoted comment or trade that cannot be shown now leaves the same notice a quoted Yap does, where before the quote vanished. Tests: the two mute cases in `create-new-contract-comment-notif.test.ts`, one case each in `social-discussion.test.ts` and `social-posts.test.ts`.

Restart with `node scripts/yap-dev.cjs api` and `node scripts/yap-dev.cjs web`. Check schema with `node scripts/yap-dev.cjs check-db`. On another device, fetch and check out `codex/yap-combined-local-20261111`, install dependencies, and provide DEV Firebase credentials as described in `yap-local-test-build.md`.

## Production cutover

Drain old API writers before moving linked reactions. Keep writes paused while applying both Yap migrations in order and switching to the API that writes linked likes and dislikes on the market comment. An old instance can acknowledge an unlike under the old key after the vote has moved. Replaying the migration cannot recover that intent. Rollback across this boundary also requires draining writes and reconciling vote keys first.
