// Run every tweet in test-tweets.txt through the drafting step and write all the results
// to test-results.md, so you can review them in one go. Never creates markets.
// Usage: npm run batch
//
// test-tweets.txt format, one test per line:
//   what it tests | author handle (or blank for "you") | the tweet | optional note from the requester | optional date posted (YYYY-MM-DD)
// Lines starting with # are comments.
import fs from 'node:fs';
import { draftMarket, formatReply } from './core.js';

const IN = new URL('../test-tweets.txt', import.meta.url);
const OUT = new URL('../test-results.md', import.meta.url);
const AT_ONCE = 4; // how many drafts to run at the same time

const tests = fs.readFileSync(IN, 'utf8')
  .split('\n')
  .map(l => l.trim())
  .filter(l => l && !l.startsWith('#'))
  .map(l => {
    const [label, author, tweet, note, posted] = l.split('|').map(s => s?.trim());
    return { label, author: author || 'you', tweet, note: note || '', posted: posted || '' };
  })
  .filter(t => t.tweet);

console.log(`Running ${tests.length} tests, ${AT_ONCE} at a time...`);
const results = new Array(tests.length);
let next = 0, done = 0;

async function worker() {
  while (next < tests.length) {
    const i = next++;
    const t = tests[i];
    // Tests without a date are treated as posted today, like a fresh tweet on X.
    const who = { author: t.author, requester: 'you', requestNote: t.note, postedAt: t.posted || new Date().toISOString().slice(0, 10) };
    try {
      const d = await draftMarket(t.tweet, `https://x.com/${t.author}/status/0`, [], who);
      results[i] = { t, d };
    } catch (e) {
      results[i] = { t, error: e.message };
    }
    console.log(`  ${++done}/${tests.length}  ${t.label}`);
  }
}
await Promise.all(Array.from({ length: AT_ONCE }, worker));

const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
let md = `# Test results\n\n${stamp} · ${tests.length} tests\n\n`;
results.forEach(({ t, d, error }, i) => {
  md += `---\n\n## ${i + 1}. ${t.label}\n\n`;
  md += `**Tweet** (@${t.author}${t.posted ? `, ${t.posted}` : ''}): ${t.tweet}\n\n`;
  if (t.note) md += `**Requester's note:** ${t.note}\n\n`;
  if (error) { md += `**ERROR:** ${error}\n\n`; return; }
  md += `**Bot: ${d.action.toUpperCase()}**\n\n`;
  md += '```\n' + formatReply(d) + '\n```\n\n';
  if (d.action === 'propose') md += `**Description:**\n\n${d.description}\n\n`;
});
fs.writeFileSync(OUT, md);
console.log(`\nDone. Results are in test-results.md`);
