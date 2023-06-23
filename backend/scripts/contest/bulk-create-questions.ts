// Run with `npx ts-node src/scripts/contest/create-questions.ts`

import { data } from './criticism-and-red-teaming'

// Dev API key for Cause Exploration Prizes (@CEP)
// const API_KEY = '188f014c-0ba2-4c35-9e6d-88252e281dbf'
// DEV API key for Criticism and Red Teaming (@CARTBot)
const API_KEY = '6ff1f78a-32fe-43b2-b31b-9e3c78c5f18c'

type CEPSubmission = {
  title: string
  author?: string
  link: string
}

// Use the API to create a new question for this Cause Exploration Prize submission
async function postQuestion(submission: CEPSubmission) {
  const { title, author } = submission
  const response = await fetch('https://dev.manifold.markets/api/v0/question', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${API_KEY}`,
    },
    body: JSON.stringify({
      outcomeType: 'BINARY',
      question: `"${title}" by ${author ?? 'anonymous'}`,
      description: makeDescription(submission),
      closeTime: Date.parse('2022-09-30').valueOf(),
      initialProb: 10,
      // Super secret options:
      // groupId: 'y2hcaGybXT1UfobK3XTx', // [DEV] CEP Tournament
      // groupId: 'cMcpBQ2p452jEcJD2SFw', // [PROD] Predict CEP
      groupId: 'h3MhjYbSSG6HbxY8ZTwE', // [DEV] CART
      // groupId: 'K86LmEmidMKdyCHdHNv4', // [PROD] CART
      visibility: 'unlisted',
      // TODO: Increase liquidity?
    }),
  })
  const data = await response.json()
  console.log('Created question:', data.slug)
}

async function postAll() {
  for (const submission of data.slice(0, 3)) {
    await postQuestion(submission)
  }
}
postAll()

/* Example curl request:
$ curl https://manifold.markets/api/v0/question -X POST -H 'Content-Type: application/json' \
    -H 'Authorization: Key {...}'
    --data-raw '{"outcomeType":"BINARY", \
                 "question":"Is there life on Mars?", \
                 "description":"I'm not going to type some long ass example description.", \
                 "closeTime":1700000000000, \
                 "initialProb":25}'
*/

function makeDescription(submission: CEPSubmission) {
  const { title, author, link } = submission
  return {
    content: [
      {
        content: [
          { text: `Will ${author ?? 'anonymous'}'s post "`, type: 'text' },
          {
            marks: [
              {
                attrs: {
                  target: '_blank',
                  href: link,
                },
                type: 'link',
              },
            ],
            type: 'text',
            text: title,
          },
          { text: '" win any prize in the ', type: 'text' },
          {
            text: 'EA Criticism and Red Teaming Contest',
            type: 'text',
            marks: [
              {
                attrs: {
                  target: '_blank',
                  href: 'https://forum.effectivealtruism.org/posts/8hvmvrgcxJJ2pYR4X/announcing-a-contest-ea-criticism-and-red-teaming',
                },
                type: 'link',
              },
            ],
          },
          { text: '?', type: 'text' },
        ],
        type: 'paragraph',
      },
      { type: 'paragraph' },
      {
        type: 'iframe',
        attrs: {
          allowFullscreen: true,
          src: link,
          frameBorder: 0,
        },
      },
    ],
    type: 'doc',
  }
}
