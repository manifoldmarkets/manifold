// Dress rehearsal for the digest email subject/preview sensitivity pipeline.
//
// Default (no args): classifier dry run — classifies a hardcoded sample of
// real prod titles, prints keyword vs final verdicts, and prints the subject
// and previewText that would result. No email is sent and nothing is written
// to the DB. Only needs GEMINI_API_KEY (loaded by runScript).
//
// --send-to <username>: full dress rehearsal — looks up the user, fetches
// their 6 for-you markets, and sends ONE real digest email via Mailgun to
// that user's address (also uses MAILGUN_KEY). Note: until the new template
// version is uploaded to Mailgun, the {{previewText}} preheader won't appear
// in the email — old template + new code is safe (the extra var is ignored).
import { runScript } from 'run-script'
import {
  classifyQuestionSensitivity,
  isSensitiveQuestion,
} from 'shared/helpers/email-subject-safety'
import { sendInterestingMarketsEmail } from 'shared/emails'
import { getPrivateUser, getUserByUsername } from 'shared/utils'
import { getForYouMarkets } from 'shared/weekly-markets-emails'

const SAMPLE_QUESTIONS = [
  {
    id: 's1',
    question:
      'Will there be a second shooting event related to the Bondi Beach mass shooting within one year?',
  },
  { id: 's2', question: 'Mitch McConnell alive all of July 2026?' },
  {
    id: 's3',
    question: 'Which AI lab will get a perfect score on the IMO 2026?',
  },
  { id: 's4', question: '2026 FIFA World Cup prop bets' },
  { id: 's5', question: 'Silver below $50/ oz by close on Friday?' },
  {
    id: 's6',
    question:
      'Will an AI solve any important mathematical conjecture before January 1st, 2030?',
  },
]

const truncate = (s: string, n = 60) =>
  s.length > n ? s.slice(0, n - 3) + '...' : s

if (require.main === module) {
  runScript(async ({ pg }) => {
    const args = process.argv.slice(2)
    const sendToIdx = args.indexOf('--send-to')

    if (sendToIdx !== -1) {
      const username = args[sendToIdx + 1]
      if (!username) {
        console.error(
          'Usage: ts-node test-email-subject-safety.ts --send-to <username>'
        )
        return
      }
      const user = await getUserByUsername(username, pg)
      if (!user) {
        console.error(`No user found with username '${username}'`)
        return
      }
      const privateUser = await getPrivateUser(user.id, pg)
      if (!privateUser) {
        console.error(`No private user found for user id ${user.id}`)
        return
      }

      // getForYouSQL self-builds the topic-interests cache for the user if
      // it is empty, so no explicit buildUserInterestsCache call is needed.
      const contracts = await getForYouMarkets(user.id, 6, privateUser)
      if (contracts.length < 6) {
        console.error(
          `Only got ${contracts.length} contracts for '${username}' but the digest template indexes [0..5]. Not sending.`
        )
        return
      }

      console.log(`Markets chosen for ${username} (first 6 are used):`)
      for (const c of contracts.slice(0, 6)) {
        console.log(`- [${c.id}] ${c.question}`)
      }
      await sendInterestingMarketsEmail(user.name, privateUser, contracts)
      console.log(
        'Done. The subject used is logged by sendTemplateEmail above. (If the user has unsubscribed from trending_markets emails, sending is silently skipped.)'
      )
      return
    }

    // Default: classifier dry run on the sample titles.
    const verdicts = await classifyQuestionSensitivity(SAMPLE_QUESTIONS)

    console.log(
      `${'title'.padEnd(62)} | ${'keyword'.padEnd(7)} | final`
    )
    console.log('-'.repeat(82))
    for (const { id, question } of SAMPLE_QUESTIONS) {
      const keyword = isSensitiveQuestion(question)
      const final = verdicts.get(id) ?? false
      console.log(
        `${truncate(question).padEnd(62)} | ${String(keyword).padEnd(
          7
        )} | ${final}`
      )
    }

    // Same derivation as sendInterestingMarketsEmail.
    const safeQuestions = SAMPLE_QUESTIONS.filter(
      (c) => !verdicts.get(c.id)
    ).map((c) => c.question)
    const subject =
      safeQuestions.length > 0
        ? `${safeQuestions[0]} & 5 more interesting markets on Manifold`
        : `6 interesting markets on Manifold this week`
    const previewText =
      safeQuestions.length > 0
        ? safeQuestions.join(' · ')
        : 'Six markets picked for you this week'

    console.log('')
    console.log(`Subject:     ${subject}`)
    console.log(`PreviewText: ${previewText}`)
  })
}
