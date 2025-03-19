import { APIHandler } from './helpers/endpoint'
import { rateLimitByUser } from './helpers/rate-limit'
import { HOUR_MS } from 'common/util/time'
// import { promptClaude, models } from 'shared/helpers/claude'
import { models, promptGemini } from 'shared/helpers/gemini'

export const generateConciseTitle: APIHandler<'generate-concise-title'> =
  rateLimitByUser(
    async (props) => {
      const { question } = props
      const system = `Make this prediction market question more concise while preserving its core meaning. Keep the same level of precision and specificity, but make it more concise.
Guidelines:
- Use declarative statements, do not end with question marks
- Use English words rather than symbols/notations, e.g. 'More than' instead of '>'
- Keep essential dates, numbers, and conditions
- Keep important distinctions between market types (date, numeric, multiple choice, and binary), i.e if the market is forecasting 'when' something might happen, keep that distinction
- Remove unnecessary words, phrases, notations, e.g. "will", "?", etc.
- Keep it concise
- Do not return anything other than the concise title
- If the question is already concise and declarative, do not change it
- Keep personal markets personal, e.g. "Will I go to the gym this week?" should NOT be changed to impersonal forms like "Personal gym attendance this week"

Example transformation:
"Will a ceasefire between Russia and Ukraine be declared within 90 days of Trump entering the office of the presidency?" => "Russia-Ukraine ceasefire in Trump's first 90 days"
"Will the first AI model that saturates Humanity's Last Exam be employable as a software engineer?" => "1st AI model to saturate Humanity's Last Exam employable as a SWE"
"In early 2028, will an AI be able to generate a full high-quality movie to a prompt?" => "Full, high-quality AI movie generator by early 2028"
"Will there be a US recession by EOY2025?" => "US recession by EOY2025"
"Will I go to the gym this week?" => "I go to the gym this week"
"Will I get a girlfriend this year?" => "I get a girlfriend this year"
"Will I think getting an art MFA was worth it?" => "I think getting an art MFA was worth it"
'When will Manifold implement a charity program?' => "Manifold charity program by date"
"US doctors negatively affected financially by AI by EOY2025" => "" (no change - already concise and declarative)
"Substack publications at 5M+ paid subscribers by 2025" => "" (no change - already concise and declarative)
"'A Minecraft Movie' (2025) Rotten Tomatoes critics score" => "" (no change - already concise and declarative)
`

      const prompt = `Question: "${question}"
Your concise version, without any other text or commentary:`

      // const response = await promptClaude(prompt, {
      //   model: models.sonnet,
      //   system,
      // })
      const response = await promptGemini(prompt, {
        model: models.flash,
        system,
      })

      return { title: response.trim() }
    },
    { maxCalls: 100, windowMs: HOUR_MS }
  )
