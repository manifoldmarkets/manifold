// Run with `npx ts-node src/scripts/contest/create-markets.ts`

import { CEP_SUBMISSIONS } from './submissions'

// Dev API key for Cause Exploration Prizes (@CEP)
// const API_KEY = '188f014c-0ba2-4c35-9e6d-88252e281dbf'
// Prod API key for @CEPBot
const API_KEY = 'b5cc8c88-64a3-45fe-a6b5-ac6a224ac56a'

type CEPSubmission = {
  title: string
  author: string
  link: string
}

// Use the API to create a new market for this Cause Exploration Prize submission
async function postMarket(submission: CEPSubmission) {
  const { title, author } = submission
  const response = await fetch('https://manifold.markets/api/v0/market', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${API_KEY}`,
    },
    body: JSON.stringify({
      outcomeType: 'BINARY',
      question: `"${title}" by ${author}`,
      description: makeDescription(submission),
      closeTime: Date.parse('2022-09-08').valueOf(),
      initialProb: 10,
      // Super secret options:
      // groupId: 'y2hcaGybXT1UfobK3XTx', // [DEV] CEP Tournament
      groupId: 'cMcpBQ2p452jEcJD2SFw', // [PROD] Predict CEP
      visibility: 'unlisted',
      // TODO: Increase liquidity?
    }),
  })
  const data = await response.json()
  console.log('Created market:', data.slug)
}

async function postAll() {
  for (const submission of CEP_SUBMISSIONS.slice(5)) {
    await postMarket(submission)
  }
}
postAll()

/* Example curl request:
$ curl https://manifold.markets/api/v0/market -X POST -H 'Content-Type: application/json' \
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
          { text: `Will ${author}'s post "`, type: 'text' },
          {
            marks: [
              {
                attrs: {
                  target: '_blank',
                  href: link,
                  class:
                    'no-underline !text-indigo-700 z-10 break-words hover:underline hover:decoration-indigo-400 hover:decoration-2',
                },
                type: 'link',
              },
            ],
            type: 'text',
            text: title,
          },
          { text: '" win first or second place in the ', type: 'text' },
          {
            text: 'Cause Exploration Prizes',
            type: 'text',
            marks: [
              {
                attrs: {
                  target: '_blank',
                  class:
                    'no-underline !text-indigo-700 z-10 break-words hover:underline hover:decoration-indigo-400 hover:decoration-2',
                  href: 'https://www.causeexplorationprizes.com/',
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
          allowfullscreen: true,
          src: link,
          frameborder: 0,
        },
      },
    ],
    type: 'doc',
  }
}
