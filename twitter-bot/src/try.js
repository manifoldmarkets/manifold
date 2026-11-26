// Rehearse the bot's conversation in the terminal, without X.
// Usage: npm run try -- "BTC will be under 50k by March"
//    or: npm run try -- --author elonmusk --note "make it end of year" "BTC will be under 50k by March"
//        (--author: who wrote the tweet, if not you; --note: what you'd write when tagging the bot;
//         --posted 2025-03-28: when the tweet was posted, if not today)
// Answer the way he would on X: "yes", "no", a change, or an answer to the bot's question.
import readline from 'node:readline/promises';
import { draftMarket, createMarket, formatReply, parseConfirmation, dryRun, manifoldIsDev } from './core.js';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const who = { requester: 'you' };
who.author = flag('--author') ?? who.requester;
who.requestNote = flag('--note') ?? '';
who.postedAt = flag('--posted') ?? new Date().toISOString().slice(0, 10); // default: posted today
const text = args.join(' ');
if (!text) { console.error('Usage: npm run try -- [--author handle] [--note "text"] "tweet text"'); process.exit(1); }
const tweetUrl = `https://x.com/${who.author}/status/0`;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on('SIGINT', () => { console.log('\nStopped. Nothing was created.'); process.exit(0); });
const history = [];

for (;;) {
  const d = await draftMarket(text, tweetUrl, history, who);
  const tweet = formatReply(d);
  console.log(`\n[${d.action}] Bot replies (${tweet.length}/280 chars):\n${tweet}`);
  if (d.action === 'propose') console.log(`\nFull market description:\n${d.description}`);

  let answer = '';
  while (!answer.trim()) answer = await rl.question('\nYour reply: ');

  if (d.action === 'propose') {
    const kind = parseConfirmation(answer);
    if (kind === 'cancel') { console.log('\nBot replies: Scrapped it.'); break; }
    if (kind === 'yes') {
      if (!dryRun) console.log(`\nCreating on ${manifoldIsDev ? 'DEV' : 'PRODUCTION'} Manifold...`);
      console.log(`Bot replies: Market's up: ${await createMarket(d, tweetUrl)}`);
      break;
    }
  }
  history.push({ bot: d, author: answer }); // a change, or an answer to the bot's question
}
rl.close();
