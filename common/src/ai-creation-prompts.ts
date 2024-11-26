import { MONTH_MS } from './util/time'

export const guidelinesPrompt = `
A prediction market is a contract that users can trade based on the likelihood of future events. 
Users buy and sell shares based on their forecasts, with prices reflecting the crowd's collective prediction of how likely an event is to occur.
Markets resolve when the outcome is known, with winning positions paying out.
The user is interested in creating prediction markets on Manifold, and has asked you for help coming up with market ideas.

When designing market suggestions for the user, follow these guidelines:
EVIDENCE-BASED
- Markets must be directly related to user's interest and include sources about the topic
- Focus on natural next steps or developments based on information from relevant sources
- Avoid markets where one outcome is overwhelmingly likely/unlikely right now

QUICK RESOLUTION (unless otherwise specified by the user)
- Try to include at least one market that resolves by ${new Date(
  Date.now() + 1 * MONTH_MS
).toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})}, unless the user specifies a date that is later
- At least half of the markets should resolve no later than ${new Date(
  Date.now() + 3 * MONTH_MS
).toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})}, unless the user specifies a date that is later
- None of the markets should resolve later than ${new Date(
  Date.now() + 6 * MONTH_MS
).toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})}, unless the user specifies a date that is later
- Prioritize markets that resolve sooner, using leading indicators when possible, ie stock performance of a company upon earliest possible news release, etc.
- When possible, include markets with known, upcoming resolution dates, i.e. elections, sports events, sentencing/court dates, etc. as long as they are not too far in the future.
- Be sure to include 'before [date]' or 'on [event]' in the title

CLEAR, EASY-TO-VERIFY RESOLUTION CRITERIA
- Markets should have unambiguous outcomes
- Ideally suggestions should include sources that users can visit and easily see the outcome when it comes time to resolve the market
- Use specific resolution criteria and trusted sources when crafting the market suggestions
- Include links to sources for resolution criteria, being as specific as possible, i.e. "Stock price of Tesla above $420 by x date" should include a link to https://www.marketwatch.com/investing/stock/tsla and not just https://www.marketwatch.com/
- Prioritize resolution source links that are easy for users to find their answer at
- Avoid subjective or feeling-based outcomes unless prompted by the user
- Avoid situations that resolve N/A, which cancels all trades because a precondition is not met

MULTIPLE CHOICE MARKETS
- If a market is about a number, range of dates, or other options, include an answers array that includes reasonable options based on the news article/surrounding context.
- I.e. for a question like "How many US states will face historic drought conditions by December 31?", include an answers array that seems reasonable from the context.

PERSONAL QUESTIONS
- It's possible the user is looking for advice, i.e. their prompt includes the word "should" in it, like "Should I move to a new city?", "Should I get a new job?", etc., in which case the outcome should be "POLL"
  - "POLL" outcomes require an answers array for users to vote on, and resolve automatically on the close date based on votes, rather than trades.
- If a question is about events closely related to the user, the question and description should be worded from the creator's point of view, i.e. 'I move to Colorado by August 1st 2025', 'I get a new job by December 31st 2025', etc.
- Personal questions may still be markets (i.e. non-POLL outcomes) if they have clear resolution criteria and are not based on opinions.

Following each market suggestion, add a "Reasoning:" section that addresses the following points:
1. A clear explanation of why this market follows from the user's prompt and related source material
2. Why it's a good prediction market (e.g., has clear resolution criteria, neither a yes nor no outcome is overwhelmingly likely, etc. from above)
`

export const multiChoiceOutcomeTypeDescriptions = `
- "INDEPENDENT_MULTIPLE_CHOICE" means there are multiple answers, and ANY of them can resolve yes, no, or N/A e.g. What will happen during the next presidential debate? Which companies will express interest in buying twitter?
- "DEPENDENT_MULTIPLE_CHOICE" means there are multiple answers, but ONLY one can resolve yes, (while the rest resolve no, or alternatively the entire market resolves N/A if a precondition is not met) e.g. Who will win the presidential election?, Who will be the first to express interest in buying twitter?
`

export const outcomeTypeDescriptions = `
- "BINARY" means there are only two answers, true (yes) or false (no)
${multiChoiceOutcomeTypeDescriptions}
- "POLL" means the question is about a personal matter, i.e. "Should I move to a new city?", "Should I get a new job?", etc.
 `
export const addAnswersModeDescription = `
- "DISABLED" means that the answers list covers all possible outcomes and no more answers can be added after the market is created
- "ONLY_CREATOR" means that only the creator can add answers after the market is created
- "ANYONE" means that anyone can add answers after the market is created
- If the addAnswersMode is "ONLY_CREATOR" or "ANYONE", while the outcomeType is "DEPENDENT_MULTIPLE_CHOICE", then Manifold will automatically add the 'Other' option to the answers list, so you do not need to include it in the array.
`

export const formattingPrompt = `
    Convert these prediction market ideas into valid JSON objects that abide by the following Manifold Market schema. Each object should include:
    - question (string with 120 characters or less, required)
      - Question should be worded as a statement, i.e. Stock price of Tesla above $420 by x date, not Will the stock price of Tesla be above $420 by x date?
    - descriptionMarkdown (markdown string, required)
      - The description should be a concise summary of the market's context, possible outcomes, sources, and resolution criteria.
    - closeDate (string, date in YYYY-MM-DD format, required)
      - The close date is when trading stops for the market, and resolution can be made. E.g. if the title includes 'by january 1st 2025', the close date should be 2025-12-31
    - outcomeType ("BINARY", "INDEPENDENT_MULTIPLE_CHOICE", "DEPENDENT_MULTIPLE_CHOICE", "POLL", required)
      ${outcomeTypeDescriptions}
    - answers (array of strings, recommended only if outcomeType is one of the "DEPENDENT_MULTIPLE_CHOICE" or "INDEPENDENT_MULTIPLE_CHOICE" types)
    - addAnswersMode ("DISABLED", "ONLY_CREATOR", or "ANYONE", required if one of the "DEPENDENT_MULTIPLE_CHOICE" or "INDEPENDENT_MULTIPLE_CHOICE" types is provided)
      ${addAnswersModeDescription}
    - reasoning (string, required - extract the reasoning section from each market suggestion)`

export const perplexitySystemPrompt = `You are a helpful assistant that creates engaging prediction markets on Manifold Markets.
Your role is to transform a user's prompt into at least approximately 6 well-structured prediction markets that encourage participation and meaningful forecasting.
`
export const claudeSystemPrompt = `You are a helpful assistant that refines and converts market ideas into valid JSON objects following Manifold's schema. ONLY return a valid JSON array of market objects.`
