// Shared pieces: draft a market from tweet text (Claude) and create it on Manifold.
import 'dotenv/config';
import fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';

const {
  MANIFOLD_API_KEY, ANTHROPIC_API_KEY,
  MANIFOLD_API_URL = 'https://api.dev.manifold.markets', // dev by default; set to https://api.manifold.markets for real
  MODEL = 'claude-sonnet-5-5',
  LIQUIDITY_TIER = '100', // mana the creator puts in to start the market: 100, 1000, 10000 or 100000
} = process.env;

export const dryRun = process.env.DRY_RUN === 'true';
export const manifoldIsDev = MANIFOLD_API_URL.includes('.dev.');
const siteUrl = manifoldIsDev ? 'https://dev.manifold.markets' : 'https://manifold.markets';
const GUIDE_PATH = new URL('../criteria-guide.md', import.meta.url);

const claude = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const draftTool = {
  name: 'draft_market',
  description: 'Respond to the author: propose a market, ask one clarifying question, or decline.',
  input_schema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['propose', 'ask', 'decline'],
        description: 'propose = draft is ready for the author to confirm; ask = you need one answer from the author first; decline = not a prediction.' },
      ask_text: { type: 'string', description: 'For ask: your question(s) to the author, all in one reply, under 280 chars.' },
      decline_reason: { type: 'string', description: 'For decline: only the reason, in one short sentence, addressed to the author as "you", under 150 chars. Do not invite a reply; the bot adds that line itself.' },
      question: { type: 'string', description: 'For propose: the yes/no market question, under 120 chars.' },
      description: { type: 'string', description: 'For propose: the full market description, in the Market description format from the guide (markdown). No tweet link; it is added automatically.' },
      summary: { type: 'string', description: 'For propose: one-line criteria for the tweet, under 90 chars, e.g. "YES if CoinGecko daily close < $50k".' },
      note: { type: 'string', description: 'For propose: an interpretation or default the author should check (e.g. how "before" or a missing year was read), under 70 chars. Omit if none.' },
      close_date: { type: 'string', description: 'For propose: YYYY-MM-DD, the deadline date (for display).' },
      close_label: { type: 'string', description: 'For propose: the deadline in plain words with its time zone, for the tweet, under 40 chars, e.g. "Nov 7, 2026, 23:59 Dublin (GMT)".' },
      close_time: { type: 'string', description: 'For propose: the exact deadline as ISO 8601 with its UTC offset, matching the Deadline line, e.g. 2026-11-07T23:59:00+00:00. The market closes at this moment.' },
      initial_prob: { type: 'integer', minimum: 1, maximum: 99, description: 'For propose: starting probability; 50 unless the tweet implies a view.' },
    },
    required: ['action'],
  },
};

// history: earlier turns in this conversation, e.g.
// [{ bot: <previous tool input>, author: "use Coinbase instead" }, ...]
// who: { author, requester, requestNote, postedAt } — handles of the tweet's author and the person
// who tagged the bot, anything the requester wrote alongside the tag, and the tweet's date (YYYY-MM-DD).
export async function draftMarket(tweetText, tweetUrl, history = [], who = {}) {
  const { author = 'unknown', requester = author, requestNote = '', postedAt = '' } = who;
  const guide = fs.readFileSync(GUIDE_PATH, 'utf8'); // re-read every time so edits apply immediately
  const today = new Date().toISOString().slice(0, 10);
  let content =
    `Today is ${today}. Turn this tweet into a binary Manifold prediction market, following the criteria guide.\n` +
    `Always respond by calling the draft_market tool.\n\n` +
    `<criteria_guide>\n${guide}\n</criteria_guide>\n\n` +
    `Tweet by @${author}${postedAt ? `, posted ${postedAt}` : ''} (${tweetUrl}):\n"""${tweetText}"""\n` +
    `Requested by @${requester}${requester === author ? " (the tweet's author)" : ''}.` +
    (requestNote
      ? `\nThe requester added: """${requestNote}"""\n` +
        `Treat that as instructions from the requester. If it's a different prediction from the tweet, ask which one they want.`
      : '');
  for (const turn of history) {
    content +=
      `\n\nYou responded:\n${JSON.stringify(turn.bot, null, 2)}\n` +
      `The author replied:\n"""${turn.author}"""`;
  }
  if (history.length) content += `\n\nRespond again, taking their reply into account. Keep everything they didn't ask to change.`;

  // Ask Claude for a draft. If a proposal comes back with fields missing, send it back once to finish.
  const messages = [{ role: 'user', content }];
  for (let attempt = 1; ; attempt++) {
    const res = await claude.messages.create({
      model: MODEL,
      max_tokens: 2500,
      tools: [draftTool],
      tool_choice: { type: 'auto' },
      messages,
    });
    const block = res.content.find(b => b.type === 'tool_use');
    if (!block) throw new Error('Claude answered without using the draft form: ' + JSON.stringify(res.content));
    const d = block.input;
    const missing = d.action === 'propose'
      ? ['question', 'description', 'close_date', 'close_time', 'close_label'].filter(k => !d[k])
      : [];
    if (!missing.length) return d;
    if (attempt === 2) throw new Error(`proposal still missing: ${missing.join(', ')}`);
    messages.push(
      { role: 'assistant', content: res.content },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: block.id, is_error: true,
        content: `Your proposal is missing: ${missing.join(', ')}. Call draft_market again with every field filled in.` }] },
    );
  }
}

// The tweet the bot posts for each kind of response. Kept under 280 characters.
export function formatReply(d) {
  if (d.action === 'ask') return clip(d.ask_text ?? 'Can you say a bit more about what you mean?', 280);
  if (d.action === 'decline') {
    const tail = '\nThink I got it wrong? Reply and tell me why.';
    return clip(`Couldn't make a clean market from that. ${d.decline_reason ?? ''}`.trim(), 280 - tail.length) + tail;
  }
  // When space runs out, the summary is dropped first. The question and the note (how
  // something was interpreted) are what he most needs to see, so they're never cut.
  const tail = `\nCloses ${d.close_label ?? d.close_date}\nReply "yes" to create it, or tell me what to change.`;
  const question = `Proposed: ${d.question}`;
  const note = d.note ? `\n${d.note}` : '';
  const room = 280 - tail.length - question.length - note.length - 1; // 1 = newline before summary
  // Show the summary only if it fits whole; a cut-off summary is worse than none.
  const summary = d.summary && d.summary.length <= room ? `\n${d.summary}` : '';
  return clip(question, 280 - tail.length - note.length) + summary + note + tail;
}
function clip(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

// Classify his reply to a proposal.
export function parseConfirmation(text) {
  const t = text.trim().toLowerCase().replace(/[.!]+$/, '');
  if (/^(y|yes|yep|yeah|yup|ok|okay|create|create it|go|do it|ship it|lgtm|👍|✅)$/.test(t)) return 'yes';
  if (/^(n|no|nope|cancel|stop|nevermind|never mind|scrap it|❌)$/.test(t)) return 'cancel';
  return 'revise';
}

export async function createMarket(d, tweetUrl) {
  // Close exactly at the deadline Claude wrote in the description. Fallback: 23:59 Eastern.
  const closeTime = new Date(d.close_time ?? `${d.close_date}T23:59:00-05:00`).getTime();
  if (Number.isNaN(closeTime)) throw new Error(`couldn't read the close time: ${d.close_time}`);
  if (!(closeTime > Date.now())) throw new Error(`close time is in the past: ${d.close_time ?? d.close_date}`);
  if (d.question.length > 120) throw new Error(`question is ${d.question.length} characters; Manifold's limit is 120. Ask for a shorter one.`);
  const body = {
    outcomeType: 'BINARY',
    question: d.question,
    descriptionMarkdown: `${d.description}\n\nFrom this tweet: ${tweetUrl}`,
    closeTime,
    initialProb: d.initial_prob ?? 50,
    liquidityTier: Number(LIQUIDITY_TIER),
  };
  if (dryRun) { console.log('[dry run] would create:', body); return `${siteUrl}/(dry-run)`; }
  const r = await fetch(`${MANIFOLD_API_URL}/v0/market`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Key ${MANIFOLD_API_KEY}` },
    body: JSON.stringify(body),
  });
  const json = await r.json();
  if (!r.ok) throw new Error(`Manifold ${r.status}: ${JSON.stringify(json)}`);
  const url = json.url ?? `${siteUrl}/${json.creatorUsername}/${json.slug}`;
  // Add the creator's referral code, in the same format as Manifold's own share button
  // (common/src/util/share.ts): ?r= plus the username in base64, without '=' padding.
  if (!json.creatorUsername) return url;
  return url + '?r=' + Buffer.from(json.creatorUsername).toString('base64').replace(/=/g, '');
}
