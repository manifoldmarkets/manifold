import { log } from 'shared/utils'
import { models, promptGeminiParsingJson } from './gemini'

// Screens market titles before they are used in email subject lines and
// inbox preview text. Markets about violent or tragic events are fine to
// include in the email body, but should not headline a push notification.
// Over-blocking is cheap (the next market's title is used instead), so this
// list errs broad. It is the floor and the fallback: the Gemini classifier
// below can only add sensitivity on top of it, never clear a keyword flag.
const SENSITIVE_TITLE_PATTERNS = [
  /\bshoot(ing|ings|er|ers|out)?s?\b/i,
  /\bshot\b/i,
  /\bgun(man|men|fire|shot|shots)?\b/i,
  /\bkill(ed|ing|ings|s|er|ers)?\b/i,
  /\bmurder/i,
  /\bsuicide/i,
  /\bdie(s|d)?\b/i,
  /\bdeath(s)?\b/i,
  /\bdead(ly)?\b/i,
  /\bfatal(ity|ities)?\b/i,
  /\bcasualt(y|ies)\b/i,
  /\bmassacre/i,
  /\bterror(ism|ist|ists)?\b/i,
  /\bbomb(ing|ings|er|ers|s)?\b/i,
  /\bassassinat/i,
  /\bgenocide/i,
  /\bhostage/i,
  /\brape\b/i,
  /\bsexual (assault|abuse)/i,
  /\bwar(s)?\b/i,
  /\binvasion\b|\binvade(s|d)?\b/i,
  /\bairstrike(s)?\b|\bair strike(s)?\b/i,
  /\bnuke(s|d)?\b|\bnuclear (war|strike|attack|weapon)/i,
  /\boverdose/i,
  /\bexecution(s)?\b/i,
  /\bkidnap/i,
  /\bstabb(ed|ing)/i,
  /\bhate crime/i,
  /\b(plane|helicopter|train) crash/i,
]

export const isSensitiveQuestion = (question: string) =>
  SENSITIVE_TITLE_PATTERNS.some((re) => re.test(question))

// Contract id -> final sensitivity verdict. The weekly digest draws every
// user's 6 markets from a shared pool of roughly the top-200 markets, so
// classification is per unique contract, never per email.
const sensitivityCache = new Map<string, boolean>()

const CLASSIFY_TIMEOUT_MS = 10_000

const CLASSIFY_SYSTEM_PROMPT = `You screen prediction-market question titles before they are used as email subject lines and push-notification previews for a betting platform. A title is sensitive if it references violence, death, tragedy, disaster, self-harm, sexual content, or would otherwise be jarring or distasteful as a notification headline inviting the reader to bet. Err on the side of sensitive.`

const isVerdictEntry = (v: unknown): v is { id: string; sensitive: boolean } =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as { id?: unknown }).id === 'string' &&
  typeof (v as { sensitive?: unknown }).sensitive === 'boolean'

// Returns a contract id -> isSensitive map for exactly the requested
// contracts. Verdict = keyword screen OR LLM verdict. On any LLM failure or
// timeout (including a missing GEMINI_API_KEY), falls back to
// keyword-only verdicts — an email must never fail or block on this.
export const classifyQuestionSensitivity = async (
  contracts: { id: string; question: string }[]
): Promise<Map<string, boolean>> => {
  const verdicts = new Map<string, boolean>()
  for (const { id, question } of contracts) {
    const cached = sensitivityCache.get(id)
    verdicts.set(id, cached ?? isSensitiveQuestion(question))
  }

  const uncached = contracts.filter((c) => !sensitivityCache.has(c.id))
  if (uncached.length === 0) return verdicts

  try {
    const prompt = `Classify each of these prediction-market question titles. Respond with strict JSON of the form {"verdicts": [{"id": string, "sensitive": boolean}]} and nothing else.\n\n${JSON.stringify(
      uncached.map(({ id, question }) => ({ id, question }))
    )}`

    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('Sensitivity classification timed out')),
        CLASSIFY_TIMEOUT_MS
      )
    })
    const response = await Promise.race([
      promptGeminiParsingJson<unknown>(prompt, {
        model: models.flash,
        system: CLASSIFY_SYSTEM_PROMPT,
        thinkingLevel: 'minimal',
      }),
      timeout,
    ]).finally(() => clearTimeout(timer))

    const rawVerdicts =
      typeof response === 'object' && response !== null
        ? (response as { verdicts?: unknown }).verdicts
        : undefined
    const llmVerdicts = Array.isArray(rawVerdicts)
      ? rawVerdicts.filter(isVerdictEntry)
      : []

    const uncachedIds = new Set(uncached.map((c) => c.id))
    const answeredIds: string[] = []
    for (const { id, sensitive } of llmVerdicts) {
      if (!uncachedIds.has(id)) continue
      // Union: the LLM can only add sensitivity, never clear a keyword flag.
      const final = (verdicts.get(id) ?? false) || sensitive
      verdicts.set(id, final)
      // Contracts the LLM did not answer keep their keyword verdict and are
      // not cached, so they get retried on the next call.
      if (sensitivityCache.size > 20_000) sensitivityCache.clear()
      sensitivityCache.set(id, final)
      answeredIds.push(id)
    }
    log('Classified email question sensitivity', {
      classified: answeredIds.length,
      flagged: answeredIds.filter((id) => verdicts.get(id)),
    })
  } catch (error) {
    log.warn('Sensitivity classification failed; using keyword verdicts', {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return verdicts
}
