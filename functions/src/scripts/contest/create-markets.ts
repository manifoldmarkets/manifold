// Run with `npx ts-node src/scripts/contest/create-markets.ts`
const API_KEY = 'e0f4561c-59c3-453e-bf58-52a17e750099'

type CEPSubmission = {
  title: string
  author: string
  link: string
}

const SUBMISSION_1: CEPSubmission = {
  title: 'New cause area: Violence against women and girls',
  author: 'Akhil',
  link: 'https://forum.effectivealtruism.org/posts/majcwf7i8pW8eMJ3v/new-cause-area-violence-against-women-and-girls',
}

// Use the API to create a new market for this Cause Exploration Prize submission
async function postMarket(submission: CEPSubmission) {
  const { title, author } = submission
  const response = await fetch('https://dev.manifold.markets/api/v0/market', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${API_KEY}`,
    },
    body: JSON.stringify({
      outcomeType: 'BINARY',
      question: `"${title}" by ${author}` + 'DEV1',
      description: makeDescription(submission),
      closeTime: 1700000000000,
      initialProb: 25,
      // Super secret options:
      groupId: 'aW0904dRtCc6FVOTCEpf',
      visibility: 'unlisted',
      // TODO: Increase liquidity?
    }),
  })
  const data = await response.json()
  console.log(data)
}

postMarket(SUBMISSION_1)

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
          src: 'https://forum.effectivealtruism.org/posts/majcwf7i8pW8eMJ3v/new-cause-area-violence-against-women-and-girls',
          frameborder: 0,
        },
      },
    ],
    type: 'doc',
  }
}
