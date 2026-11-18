# Yap shared discussions and re-Yaps

Combined implementation, updated 18 November 2026. No production deployment.

## Behaviour

- Re-Yap shares a stable original item. One active share per person; undo does not delete content. Re-sharing can bump it at most once per 24 hours, including undo/re-add cycles.
- Quote creates a distinct authored post. Unrelated takes that link the same market stay separate.
- Market comments and their Yap representations have one logical identity. Reply, edit, likes and moderation work consistently from either surface; legacy market rows remain for compatibility.
- Replies use normal commenting eligibility; publishing and re-Yapping require membership. Public discussions can be read while signed out.
- Thread participation subscribes the participant; mute/unmute applies to thread notifications. Re-Yap notifications aggregate for the original author.
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
3. Share a market comment, reply from Yap, then reply from the market. Check placement, shared likes, edits and deletion from either side. Shared comments keep the market's editing permissions; standalone Yaps retain the 30-minute window.
4. Follow/mute/unmute the thread from the Yap menu. Participants get grouped in-app replies; muted threads suppress reply alerts, while explicit mentions still work. Other market followers retain their existing notifications.
5. Look at Explore for native Yap cards. Open a Yap URL while signed out. Confirm moderator-comment mode and Post to Yap remain mutually exclusive.

The count shows active unique sharers. Re-Yapping does not create a new authored post or silently subscribe the sharer to replies. Quotes remain separate, even when they refer to the same market.

## Verification

- 98 focused tests passed after integrating main on 18 November: 89 backend/shared tests across social posting, rich content, shared edit/deletion, public access, mentions, ranking, notifications and comment continuations; 9 common rich-content conversion tests.
- API source typecheck and full web typecheck passed. Changed-file ESLint: no errors (one existing unused-argument warning in notification UI).
- `node scripts/yap-regressions.cjs` executes the actual handlers/SQL against temporary tables on DEV and rolls back. Covers migration/like deduplication, unique/reversible shares, cooldown, thread mutes, stable native comment identity, moderation, creator exclusions and distinct-participant ranking. No test notifications are sent.
- DEV migration applied. Public Yap feed, detail and unified Explore API returned HTTP 200; /yap compiled and returned HTTP 200.
- No signed-in visual walkthrough has been performed. The flows above are the manual acceptance pass.

Restart with `node scripts/yap-dev.cjs api` and `node scripts/yap-dev.cjs web`. Check schema with `node scripts/yap-dev.cjs check-db`. On another device, fetch and check out `codex/yap-combined-local-20261111`, install dependencies, and provide DEV Firebase credentials as described in `yap-local-test-build.md`.
