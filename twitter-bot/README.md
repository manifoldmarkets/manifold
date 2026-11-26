# AskManifold — Twitter/X bot

Tag **@AskManifold** on X under a prediction and it drafts a Manifold market from that tweet. Nothing is created until the person who tagged it confirms.

1. Someone on the allowed list tags the bot, under their own prediction or under someone else's tweet (reply or quote tweet).
2. The bot replies with one of:
   - **a proposal:** question, one-line criteria, how it read anything ambiguous, and the exact close time;
   - **a question**, when the tweet is ambiguous (e.g. "by 2027": before Jan 1 or by Dec 31?);
   - **a decline**, when it's not a prediction (an opinion, a joke, already resolved).
3. The requester replies **"yes"** to create the market, **a change** to get a redraft, or **"no"** to drop it. A decline can be challenged by replying with why.
4. On "yes", the market is created under the account whose Manifold API key the bot uses, and the bot replies with the link (with that account's referral code).

Only the person who started a conversation can answer it. Proposals nobody answers are forgotten after 7 days.

How the bot drafts markets (dates, sources, when to ask vs. decline, description format) is set in **`criteria-guide.md`**, which is plain English and read fresh on every draft. Edit that to change its behaviour; no code changes needed.

## Files
- `src/bot.js` — watches @AskManifold's mentions and runs the conversation
- `src/core.js` — drafting (Claude) and market creation (Manifold API)
- `src/try.js` — rehearse a conversation in the terminal, no X needed
- `src/batch.js` + `test-tweets.txt` — run every test tweet at once, results in `test-results.md`
- `criteria-guide.md` — the drafting rules
- `deploy.sh`, `Dockerfile` — deployment to Cloud Run

## Running locally
```
npm install
cp .env.example .env   # fill in the keys
npm run try -- "BTC will be under 50k by March"     # test drafting, no X
npm run batch                                         # run all test tweets
npm start                                             # run the bot on X
```
`npm run try` accepts `--author handle`, `--note "what the requester wrote"` and `--posted YYYY-MM-DD`.

## Deploying (Cloud Run, same setup as `backend/discord-bot`)
Runs as one always-on instance (`min-instances 1`, `max-instances 1`, no CPU throttling). It answers HTTP on `$PORT` only so Cloud Run sees it as healthy.

**One-time setup per GCP project:** create these secrets in Secret Manager:

| Secret | Value |
|---|---|
| `TWITTER_BOT_X_API_KEY` | X app API key (consumer key) |
| `TWITTER_BOT_X_API_SECRET` | X app API key secret |
| `TWITTER_BOT_X_ACCESS_TOKEN` | Access token generated as @AskManifold (Read and write) |
| `TWITTER_BOT_X_ACCESS_SECRET` | Access token secret |
| `TWITTER_BOT_ANTHROPIC_API_KEY` | Anthropic API key (drafting) |
| `TWITTER_BOT_MANIFOLD_API_KEY` | Manifold API key of the account that creates the markets |

**Deploy:**
```
cd twitter-bot
./deploy.sh dev                                   # markets on dev.manifold.markets, answers @TestManifold
ALLOWED_USERNAME=someone ./deploy.sh prod         # markets on manifold.markets
```

**Known limits of this first version:**
- Conversation state (open proposals, last mention seen) is kept in a local file, so it's lost when the container restarts or is redeployed. Open proposals are then forgotten, and the bot skips mentions that arrived while it was down. Fine for testing; moving it to Supabase would fix it.
- One allowed X account, and one Manifold API key for all markets.

## Ideas for later
- Duplicate-market search before proposing (link the existing market instead).
- Reverse Cramer: watch one account and queue drafts for approval.
- Verified X↔Manifold account linking, so many people can use it without sharing API keys.
- Multiple-choice and numeric markets.
- A once-per-person reply to strangers who answer someone else's proposal.
