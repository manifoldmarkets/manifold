// Screens market titles before they are used in email subject lines and
// inbox preview text. Markets about violent or tragic events are fine to
// include in the email body, but should not headline a push notification.
// Over-blocking is cheap (the next market's title is used instead), so this
// list errs broad. A cached per-contract LLM verdict can be layered on later.
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

// First question safe to headline the email subject, if any.
export const pickSubjectQuestion = (questions: string[]) =>
  questions.find((q) => !isSensitiveQuestion(q))
