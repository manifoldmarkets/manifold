// Run with `npx ts-node src/scripts/contest/create-markets.ts`

import { data } from "./acxquestionstest";

// API key for ACX Bot @ACXBot
// const API_KEY = 'XXXXXXXXXXXXXX'
// DEV API key for ACX Bot @ACXBot
const API_KEY = "e112b79a-b843-4155-b574-02ed21095a58";

type ACXSubmission = {
  ID: number;
  question: string;
  description?: string;
  category: string;
};

// Use the API to create a new market
async function postMarket(submission: ACXSubmission) {
  const { question } = submission;
  const response = await fetch("https://dev.manifold.markets/api/v0/market", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${API_KEY}`,
    },
    body: JSON.stringify({
      outcomeType: "BINARY",
      question: `"${question}"`,
      description: makeDescription(submission),
      closeTime: Date.parse("2023-02-01 11:59:59 GMT").valueOf(),
      initialProb: 50,
      groupId: "f5Lnf2ZMFYvPLPAwQOSG", // [DEV] ACX Questions
      // groupId: 'XXXXXXXXXXXXXXXX', // [PROD] ACX questions
    }),
  });
  const data = await response.json();
  console.log("Created market:", data.slug);
}

async function postAll() {
  for (const submission of data) {
    await postMarket(submission);
  }
}
postAll();

function makeDescription(submission: ACXSubmission) {
  const { ID, description, category } = submission;

  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: `${
              description ?? "No description provided, see links below."
            }`,
          },
        ],
      },
      { type: "paragraph" },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text:
              "This is question number " +
              ID +
              " and is in " +
              category +
              " on the ",
          },
          {
            type: "text",
            marks: [
              {
                type: "link",
                attrs: {
                  href: "https://astralcodexten.substack.com/p/2023-prediction-contest",
                  target: "_blank",
                  class: null,
                },
              },
            ],
            text: "Astral Codex Ten 2023 Prediction Contest",
          },
          {
            type: "text",
            text: ". The contest rules and full list of questions are available ",
          },
          {
            type: "text",
            marks: [
              {
                type: "link",
                attrs: {
                  href: "https://docs.google.com/forms/d/e/1FAIpQLSengVfY43SZHUD1jue24yKRyqOM4MawwYVUqhHukxtnKXKADA/viewform",
                  target: "_blank",
                  class: null,
                },
              },
            ],
            text: "here",
          },
          { type: "text", text: "." },
        ],
      },
    ],
  };
}
