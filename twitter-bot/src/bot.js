// manibot: when ALLOWED_USERNAME tags the bot on X, draft a Manifold market
// from the tweet, create it with their Manifold API key, and reply with the link.
import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import { TwitterApi } from 'twitter-api-v2';
import { draftMarket, createMarket, formatReply, parseConfirmation, dryRun, manifoldIsDev } from './core.js';

const {
  X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET,
  ALLOWED_USERNAME,
  POLL_SECONDS = '90',
  STATE_FILE = './state.json',
} = process.env;

// Stop with a clear message if a required setting is missing, instead of a confusing crash later.
const missing = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET',
  'ANTHROPIC_API_KEY', 'MANIFOLD_API_KEY', 'ALLOWED_USERNAME'].filter(k => !process.env[k]);
if (missing.length) {
  console.error(`Missing settings: ${missing.join(', ')}. Add them to .env (or the server's secrets) and start again.`);
  process.exit(1);
}

const x = new TwitterApi({
  appKey: X_API_KEY, appSecret: X_API_SECRET,
  accessToken: X_ACCESS_TOKEN, accessSecret: X_ACCESS_SECRET,
});

// ---------- state (last mention seen + processed ids) ----------
function loadState() {
  let s;
  try { s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { s = {}; }
  return { sinceId: null, done: [], pending: {}, ...s };
}
function saveState(s) {
  s.done = s.done.slice(-500);
  const cutoff = Date.now() - PENDING_DAYS * 864e5; // forget proposals nobody answered
  for (const [id, p] of Object.entries(s.pending)) if (p.at < cutoff) delete s.pending[id];
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

// Posts a reply and returns the new tweet's id.
async function reply(text, tweetId) {
  if (dryRun) {
    const fakeId = `dry-${Date.now()}`;
    console.log(`[dry run] would reply to ${tweetId} (as ${fakeId}):\n${text}\n`);
    return fakeId;
  }
  const res = await x.v2.reply(text, tweetId);
  return res.data.id;
}

function stripHandles(text) {
  return text.replace(/@\w+/g, '').replace(/https:\/\/t\.co\/\w+/g, '').trim();
}

const PENDING_DAYS = 7;

// Post the bot's response (proposal, question or decline). All three wait for his reply
// (a decline can be challenged), so we remember them, keyed by the id of the tweet we just posted.
async function respond(state, d, convo, replyToId) {
  const postedId = await reply(formatReply(d), replyToId);
  state.pending[postedId] = { ...convo, last: d, at: Date.now() };
}

async function handleMention(state, m, includes, users) {
  const author = users.get(m.author_id);
  if (author?.username?.toLowerCase() !== ALLOWED_USERNAME.toLowerCase()) return; // ignore everyone else

  const parentRef = m.referenced_tweets?.find(r => r.type === 'replied_to');
  const text = stripHandles(m.text);

  // 1. He's replying to one of our proposals or questions.
  const pending = parentRef && state.pending[parentRef.id];
  if (pending) {
    if (m.author_id !== pending.requesterId) return; // only whoever started the conversation can answer it
    if (!text) return; // just a tag with no answer; keep waiting
    delete state.pending[parentRef.id];
    const { sourceText, tweetUrl, last, requesterId, who } = pending;
    if (last.action === 'propose') {
      const answer = parseConfirmation(text);
      if (answer === 'yes') {
        const url = await createMarket(last, tweetUrl);
        console.log(`created: ${last.question} -> ${url}`);
        await reply(`Market's up: ${url}`, m.id);
        return;
      }
      if (answer === 'cancel') { await reply('Scrapped it.', m.id); return; }
    }
    // A change to the proposal, an answer to our question, or a challenge to a decline:
    // redraft with the whole conversation.
    const history = [...pending.history, { bot: last, author: text }];
    const d = await draftMarket(sourceText, tweetUrl, history, who);
    await respond(state, d, { sourceText, tweetUrl, history, requesterId, who }, m.id);
    return;
  }

  // 2. New request. If the tag is a quote tweet or a reply, the quoted/replied-to tweet is the
  // prediction (it can be anyone's), and whatever the requester wrote is passed along as instructions.
  // A tag on its own, with no tweet above it, means the mention itself is the prediction.
  const quoteRef = m.referenced_tweets?.find(r => r.type === 'quoted');
  const sourceRef = quoteRef ?? parentRef;
  const parent = sourceRef && includes.find(t => t.id === sourceRef.id);
  const source = parent ?? m;
  const requestNote = parent ? text : '';
  const who = {
    author: users.get(source.author_id)?.username ?? 'unknown',
    requester: author.username,
    requestNote,
    postedAt: source.created_at?.slice(0, 10) ?? '',
  };
  const tweetUrl = `https://x.com/${who.author}/status/${source.id}`;
  const sourceText = stripHandles(source.text);

  const d = await draftMarket(sourceText, tweetUrl, [], who);
  await respond(state, d, { sourceText, tweetUrl, history: [], requesterId: m.author_id, who }, m.id);
}

async function poll(me, state) {
  const res = await x.v2.userMentionTimeline(me.id, {
    ...(state.sinceId ? { since_id: state.sinceId } : {}),
    max_results: 20,
    expansions: ['author_id', 'referenced_tweets.id', 'referenced_tweets.id.author_id'],
    'tweet.fields': ['author_id', 'referenced_tweets', 'created_at'],
    'user.fields': ['username'],
  });
  const tweets = res.tweets ?? [];
  if (!tweets.length) return;
  const users = new Map((res.includes?.users ?? []).map(u => [u.id, u]));
  const included = res.includes?.tweets ?? [];

  // First run with no saved state: mark existing mentions as seen instead of replaying them.
  if (!state.sinceId) {
    state.sinceId = tweets[0].id;
    saveState(state);
    console.log(`first run: skipping ${tweets.length} older mention(s)`);
    return;
  }

  for (const m of [...tweets].reverse()) { // oldest first
    if (state.done.includes(m.id)) continue;
    try { await handleMention(state, m, included, users); }
    catch (e) { console.error(`mention ${m.id} failed:`, e.message); }
    state.done.push(m.id);
    state.sinceId = m.id;
    saveState(state);
  }
}

async function main() {
  // Find out which account we're running as. If X can't be reached, wait and try again.
  let me;
  while (!me) {
    try { me = (await x.v2.me()).data; }
    catch (e) {
      console.error(`couldn't reach X (${e.code ?? e.message}); trying again in 60s`);
      await new Promise(r => setTimeout(r, 60_000));
    }
  }
  console.log(`running as @${me.username}, listening for @${ALLOWED_USERNAME}, ` +
    `Manifold ${manifoldIsDev ? 'DEV' : 'PRODUCTION'}${dryRun ? ', DRY RUN' : ''}`);
  const state = loadState();
  for (;;) {
    try { await poll(me, state); }
    catch (e) { console.error('poll failed:', e.message); }
    await new Promise(r => setTimeout(r, Number(POLL_SECONDS) * 1000));
  }
}

// Cloud Run needs the container to answer HTTP on $PORT to count it as healthy. Only when
// deployed (PORT is set); running locally with `npm start` skips it. Same idea as
// backend/discord-bot/src/server.ts.
if (process.env.PORT) {
  http.createServer((req, res) => res.end('AskManifold bot is running')).listen(Number(process.env.PORT), '0.0.0.0');
}

main();
