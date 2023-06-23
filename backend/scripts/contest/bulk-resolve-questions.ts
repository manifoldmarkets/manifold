// Run with `npx ts-node src/scripts/contest/resolve-questions.ts`

const DOMAIN = 'dev.manifold.markets'
// Dev API key for Cause Exploration Prizes (@CEP)
const API_KEY = '188f014c-0ba2-4c35-9e6d-88252e281dbf'
const GROUP_SLUG = 'cart-contest'

// Can just curl /v0/group/{slug} to get a group
async function getGroupBySlug(slug: string) {
  const resp = await fetch(`https://${DOMAIN}/api/v0/group/${slug}`)
  return await resp.json()
}

async function getQuestionsByGroupId(id: string) {
  // API structure: /v0/group/by-id/[id]/questions
  const resp = await fetch(
    `https://${DOMAIN}/api/v0/group/by-id/${id}/questions`
  )
  return await resp.json()
}

/* Example curl request:
# Resolve a binary question
$ curl https://manifold.markets/api/v0/question/{questionId}/resolve -X POST \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Key {...}' \
    --data-raw '{"outcome": "YES"}'
*/
async function resolveQuestionById(
  id: string,
  outcome: 'YES' | 'NO' | 'MKT' | 'CANCEL'
) {
  const resp = await fetch(`https://${DOMAIN}/api/v0/question/${id}/resolve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${API_KEY}`,
    },
    body: JSON.stringify({
      outcome,
    }),
  })
  return await resp.json()
}

async function main() {
  const group = await getGroupBySlug(GROUP_SLUG)
  const questions = await getQuestionsByGroupId(group.id)

  // Count up some metrics
  console.log('Number of questions', questions.length)
  console.log(
    'Number of resolved questions',
    questions.filter((m: any) => m.isResolved).length
  )

  // Resolve each question to NO
  for (const question of questions) {
    if (!question.isResolved) {
      console.log(`Resolving question ${question.url} to NO`)
      await resolveQuestionById(question.id, 'NO')
    }
  }
}
main()

export {}
