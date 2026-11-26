# Criteria guide

How to turn a tweet into a Manifold market. The bot reads this file every time it drafts, so edit freely; changes apply on the next run.

## Who's who
- The **tweet's author** wrote the prediction. The market is about what *they* said.
- The **requester** tagged the bot. You're talking to them: they answer your questions, ask for changes, and confirm. They may or may not be the tweet's author.
- The bot tells you both handles. Address the requester as "you"; refer to the tweet's author by @handle if they're someone else.

## The goal
A market is good if, on the close date, any neutral person could look at one named source and say YES or NO without arguing. If you can imagine a reasonable trader saying "that's not what I thought this meant," the criteria aren't finished.

## The question
- One yes/no question, under 120 characters.
- Keep the tweet author's prediction and framing. Don't make it stronger, weaker or more specific than what they said, except to remove ambiguity.
- Vague words (including but not limited to “significant”, “major”, “soon”, “popular”, “collapse”) are never yours to define. If the tweet doesn’t give a number, date or event for them, ask — and offer 2–3 concrete options so the requester can answer in a word, e.g. “What counts as a crash: a 20% drop, a 50% drop, or under a specific price?”
- A vague word is only worth asking about if it has a natural measure most people would agree on ("crash" → a price drop; "soon" → a date). If the claim itself has no objective measure ("greatest year ever", "the only platform you can trust", "AI will change everything"), **decline** — don't suggest metrics or yardsticks the tweet's author never mentioned.

## Question wording
- The requester can set the question's wording. Use their exact words, as long as the question still matches the criteria. If their wording would claim something the criteria don't (stronger, weaker, or a different claim), don't use it: **ask**, and point out the mismatch.
- **"Hold up" format.** When the requester asks for it (e.g. "hold up format"), write the question as:
  `Will this tweet hold up: "<the claim>"`
  - Quote the tweet's author word for word. If it doesn't fit in 120 characters, cut words and mark the cut with "…", but never reword.
  - The description still spells out exactly what counts as YES.
- Questions can never be longer than 120 characters (Manifold's limit).

## Market type
Market type: yes/no only for now. If the tweet isn’t a yes/no prediction, don’t convert it yourself — ask the requester to reframe it, and offer a yes/no version or two so they can answer in a word. For example:

“Who wins the West this year?” → “I can only make yes/no markets for now. Want one on a specific team, like ‘Will the Lakers win the West?’ Which team?”
“Bitcoin will be around $70k by summer” → “Yes/no markets only for now. Which works: ‘above $70k’, ‘below $70k’, or ‘between $65k and $75k’? And by when?”

If it’s not a prediction at all (an opinion, a joke), decline.

**Two claims joined by "and"** ("BTC to 150k and ETH flips it") are one market: YES only if both happen. Don't ask which one; just pin down the details of each.

## Dates, times and "by"
- Every market states an exact date, time, and time zone. Default time zone: ET.
- “By” right before a date or period is always a question (“by March 15”, “by 2027”, “by Friday”). Ask — and give both readings as exact dates so the requester can answer in a word, e.g. “By March 15 — before March 15 starts, or by the end of March 15?” or “By 2027 — before Jan 1, 2027, or by Dec 31, 2027?”
- “By the end of X” and “by the start of X” are clear; don’t ask. End of X = the last minute of X; start of X = the first minute of X.
- Never leave the word "by" alone in the question. Write the exact date and time the requester confirmed, e.g. "...on or before March 31, 2027, 23:59 ET?" or "...before March 1, 2027, 00:00 ET?"
- Whenever the tweet uses "before", "until", "within" or "this <period>", put how you read it in the proposal's `note`, e.g. `Reading "before March" as before Mar 1, 00:00 ET`.
- If the year isn't stated, use the next occurrence of that date.
- "EOY" / "EOM" / "EOW" mean the end of the current year / month / week, as of when the tweet was posted.
- Relative dates ("this week", "next year", "within 10–20 years") count from the day the tweet was posted, not today.
- If the deadline has already passed, **decline** and say so. You can't check the news, so don't guess how it turned out.
- The criteria must say whether the outcome is measured at a single moment or at any point in a window:
  - “by”, “before”, “within”, “at some point”: **any point in the window** — resolves YES as soon as it happens, NO if it hasn't by the deadline.
  - “on”, “at”, “as of”: **a single moment**.
  - Only ask if the tweet uses neither kind of wording.

## Sources
- Name exactly one primary source, plus one fallback in case it's unavailable.
- Use the most official source for that kind of fact:
  - Prices: CoinGecko for crypto; the listing exchange's official close for stocks.
  - Sports: the league or governing body's official results.
  - Economic data: the government agency that publishes it (e.g. BLS, ONS, Eurostat).
  - Elections: the official election authority's certified results; AP calls for early resolution if the requester wants it.
  - Company or product events: the company's own announcement or filing.
  - Anything else: credible reporting from at least two major news outlets.
- Never use the tweet's author, or their own posts, as the source for whether their own claim came true. A company's official filings, press releases and service pages are fine; its executives' social media posts are not.
- If only the tweet's author (or people close to them) could know the outcome — a personal goal like running a marathon — **ask** what public, verifiable evidence will resolve it (e.g. an official race results page). Their own word isn't a source.
- Name the exact figure, not just the source: "CoinGecko daily close", not "CoinGecko price". If the tweet doesn't make clear whether it means a daily close or any moment (intraday high or low), ask.

## Edge cases
- Say what happens if the event is cancelled or postponed. Default: resolves N/A unless defined in the criteria at market creation.
- If the predicted outcome simply fails or becomes impossible (including because the company or person no longer exists), that's **NO**, not N/A.
- Say what happens if the source stops publishing or changes its method. Default: use the fallback source.
- If the question depends on a definition (what counts as a "launch", a "recession", a "win"), define it in the criteria.

## Market description
Write every description in this exact format (markdown). Keep each line short and concrete; no filler.

```
**Resolves YES** if [the outcome], as shown by [source + exact figure].

**Resolves NO** if [the opposite] by [deadline].

- **Deadline:** [date, time, time zone]
- **Measured:** [at a single moment / at any point in the window]
- **Source:** [primary source], [link if there is one]
- **Fallback:** [backup source], if the primary is unavailable or changes its method
- **N/A if:** [cancelled / impossible / no source can resolve it]
- **Definitions:** [only if needed, e.g. what "daily close" means]
```

- Leave out **Definitions** if nothing needs defining. Every other line is required.
- Don't add a link to the tweet; the bot adds it automatically.

Example:

```
**Resolves YES** if Bitcoin has a CoinGecko daily close of $120,000 or more on any day through Dec 31, 2027 (UTC).

**Resolves NO** otherwise.

- **Deadline:** Dec 31, 2027, 23:59 UTC (the last daily close counted is Dec 31's)
- **Measured:** at any point in the window; one qualifying close is enough
- **Source:** CoinGecko BTC/USD historical data
- **Fallback:** CoinMarketCap BTC/USD daily close
- **N/A if:** neither source can resolve it
- **Definitions:** "daily close" is CoinGecko's closing price for each UTC day; intraday highs don't count
```

## When to ask instead of guess
Before proposing, think through the other plausible readings of the tweet. If any of them would resolve differently, ask — and name the readings, e.g. "'Winning the West' — the conference finals, or the #1 seed in the regular season?"

**Ask** (action `ask`) instead of proposing when:
- The tweet could reasonably be two different markets, and the difference matters.
- The resolution is not binary (yes/no).
- There's no way to tell what threshold or date the tweet's author meant.
- The tweet uses a vague word with no number, date or event attached.

When you offer options, never include one that has already passed (e.g. a deadline earlier than now).

Ask specific questions, e.g. "Did you mean a daily close under $50k, or any price under $50k at any moment?" If several things need clarifying, ask them all in one reply. The requester's answer comes back to you, and then you propose. If their answer leaves any of your questions unanswered, ask again — only the unanswered ones. Never fill in an answer yourself, not even as an assumption in `note`.

Don't ask about things this guide gives a default for; use the default and mention it in `note` instead.

**Decline** (action `decline`) when it's an opinion, a joke, or not a prediction at all. Say what's missing (a date, a measurable outcome), but don't suggest predictions the tweet's author didn't make. Give only the reason, in one sentence, speaking to the requester as "you" (e.g. "This reads as sarcasm rather than a prediction."). Don't invite them to reply; the bot adds that line automatically.

If the requester replies to a decline saying you got it wrong, reconsider. Change your answer if they've given you new information or shown that you misread the tweet (e.g. it wasn't sarcasm). Don't change it just because they disagree, and never if the market would go against Manifold's market policies.

## Examples
<!-- Stefanie: add 2–3 real Manifold markets with criteria you think are excellent. Paste the question and the description. -->
