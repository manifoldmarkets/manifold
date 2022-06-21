# API

:::caution

Our API is still in alpha — things may change or break at any time!

If you have questions, come chat with us on [Discord](https://discord.com/invite/eHQBNBqXuh). We’d love to hear about what you build!

:::

## General notes

Some APIs are not associated with any particular user. Other APIs require authentication.

APIs that require authentication accept an `Authorization` header in one of two formats:

- `Authorization: Key {key}`. A Manifold API key associated with a user
  account. Each account may have zero or one API keys. To generate an API key
  for your account, visit your user profile, click "edit", and click the
  "refresh" button next to the API key field at the bottom. You can click it
  again any time to invalidate your existing key and generate a new one.

- `Authorization: Bearer {jwt}`. A signed JWT from Firebase asserting your
  identity. This is what our web client uses. It will probably be annoying for
  you to generate and we will not document it further here.

API requests that accept parameters should either have the parameters in the
query string if they are GET requests, or have a body with a JSON object with
one property per parameter if they are POST requests.

API responses should always either have a body with a JSON result object (if
the response was a 200) or with a JSON object representing an error (if the
response was a 4xx or 5xx.)

## Endpoints

### `GET /v0/markets`

Lists all markets, ordered by creation date descending.

Parameters:

- `limit`: Optional. How many markets to return. The maximum and the default is 1000.
- `before`: Optional. The ID of the market before which the list will start. For
  example, if you ask for the most recent 10 markets, and then perform a second
  query for 10 more markets with `before=[the id of the 10th market]`, you will
  get markets 11 through 20.

Requires no authorization.

- Example request
  ```
  https://manifold.markets/api/v0/markets?limit=1
  ```
- Example response
  ```json
  [
    {
      "id":"EvIhzcJXwhL0HavaszD7",
      "creatorUsername":"Austin",
      "creatorName":"Austin",
      "createdTime":1653850472294,
      "creatorAvatarUrl":"https://lh3.googleusercontent.com/a-/AOh14GiZyl1lBehuBMGyJYJhZd-N-mstaUtgE4xdI22lLw=s96-c",
      "closeTime":1653893940000,
      "question":"Will I write a new blog post today?",
      "description":"I'm supposed to, or else Beeminder charges me $90.\nTentative topic ideas:\n- \"Manifold funding, a history\"\n- \"Markets and bounties allow trades through time\"\n- \"equity vs money vs time\"\n\nClose date updated to 2022-05-29 11:59 pm",
      "tags":[
        "personal",
        "commitments"
        ],
      "url":"https://manifold.markets/Austin/will-i-write-a-new-blog-post-today",
      "pool":146.73022894879944,
      "probability":0.8958175225896258,
      "p":0.08281474972181882,
      "totalLiquidity":102.65696071594805,
      "outcomeType":"BINARY",
      "mechanism":"cpmm-1",
      "volume":241,
      "volume7Days":0,
      "volume24Hours":0,
      "isResolved":true,
      "resolution":"YES",
      "resolutionTime":1653924077078
    },
    ...
  ```
- Response type: Array of `LiteMarket`

  ```tsx
  // Information about a market, but without bets or comments
  type LiteMarket = {
    // Unique identifer for this market
    id: string

    // Attributes about the creator
    creatorUsername: string
    creatorName: string
    createdTime: number // milliseconds since epoch
    creatorAvatarUrl?: string

    // Market attributes. All times are in milliseconds since epoch
    closeTime?: number // Min of creator's chosen date, and resolutionTime
    question: string
    description: string

    // A list of tags on each market. Any user can add tags to any market.
    // This list also includes the predefined categories shown as filters on the home page.
    tags: string[]
    
    // Note: This url always points to https://manifold.markets, regardless of what instance the api is running on.
    // This url includes the creator's username, but this doesn't need to be correct when constructing valid URLs.
    //   i.e. https://manifold.markets/Austin/test-market is the same as https://manifold.markets/foo/test-market
    url: string

    outcomeType: string // BINARY, FREE_RESPONSE, or NUMERIC
    mechanism: string // dpm-2 or cpmm-1

    pool: number // sum of YES and NO shares in liquidity pool for CPMM, null for DPM
    probability: number
    p?: number // probability constant in y^p * n^(1-p) = k
    totalLiquidity?: number

    volume: number
    volume7Days: number
    volume24Hours: number

    isResolved: boolean
    resolutionTime?: number
    resolution?: string
  }
  ```

### `GET /v0/market/[marketId]`

Gets information about a single market by ID. Includes comments, bets, and answers.

Requires no authorization.

- Example request

  ```
  https://manifold.markets/api/v0/market/3zspH9sSzMlbFQLn9GKR
  ```

- <details><summary>Example response</summary><p>

  ```json
  {
    "id":"lEoqtnDgJzft6apSKzYK",
    "creatorUsername":"Angela",
    "creatorName":"Angela",
    "createdTime":1655258914863,
    "creatorAvatarUrl":"https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/user-images%2FAngela%2F50463444807_edfd4598d6_o.jpeg?alt=media&token=ef44e13b-2e6c-4498-b9c4-8e38bdaf1476",
    "closeTime":1655265001448,
    "question":"What is good?",
    "description":"Resolves proportionally to the answer(s) which I find most compelling. (Obviously I’ll refrain from giving my own answers)\n\n(Please have at it with philosophy, ethics, etc etc)\n\n\nContract resolved automatically.",
    "tags":[],
    "url":"https://manifold.markets/Angela/what-is-good",
    "pool":null,
    "outcomeType":"FREE_RESPONSE",
    "mechanism":"dpm-2",
    "volume":112,
    "volume7Days":212,
    "volume24Hours":0,
    "isResolved":true,
    "resolution":"MKT",
    "resolutionTime":1655265001448,
    "answers":[
      {
        "createdTime":1655258941573,
       "avatarUrl":"https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/user-images%2FAngela%2F50463444807_edfd4598d6_o.jpeg?alt=media&token=ef44e13b-2e6c-4498-b9c4-8e38bdaf1476",
       "id":"1",
        "username":"Angela",
       "number":1,
       "name":"Angela",
       "contractId":"lEoqtnDgJzft6apSKzYK",
        "text":"ANTE",
        "userId":"qe2QqIlOkeWsbljfeF3MsxpSJ9i2",
        "probability":0.66749733001068
      },
      {
        "name":"Isaac King",
        "username":"IsaacKing",
        "text":"This answer",
        "userId":"y1hb6k7txdZPV5mgyxPFApZ7nQl2",
        "id":"2",
        "number":2,
        "avatarUrl":"https://lh3.googleusercontent.com/a-/AOh14GhNVriOvxK2VUAmE-jvYZwC-XIymatzVirT0Bqb2g=s96-c",
        "contractId":"lEoqtnDgJzft6apSKzYK",
        "createdTime":1655261198074,
        "probability":0.008922214311142757
      },
      {
        "createdTime":1655263226587,
        "userId":"jbgplxty4kUKIa1MmgZk22byJq03",
        "id":"3",
        "avatarUrl":"https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/user-images%2FMartin%2Fgiphy.gif?alt=media&token=422ef610-553f-47e3-bf6f-c0c5cc16c70a",
        "text":"Toyota Camry",
        "contractId":"lEoqtnDgJzft6apSKzYK",
        "name":"Undox",
        "username":"Undox",
        "number":3,
        "probability":0.008966714133143469
      },
      {
        "number":4,
        "name":"James Grugett",
        "userId":"5LZ4LgYuySdL1huCWe7bti02ghx2",
        "text":"Utility (Defined by your personal utility function.)",
        "createdTime":1655264793224,
        "contractId":"lEoqtnDgJzft6apSKzYK",
        "username":"JamesGrugett",
        "id":"4",
        "avatarUrl":"https://lh3.googleusercontent.com/a-/AOh14GjC83uMe-fEfzd6QvxiK6ZqZdlMytuHxevgMYIkpAI=s96-c",
        "probability":0.09211463154147384
      }
    ],
    "comments":[
      {
        "id":"ZdHIyfQazHyl8nI0ENS7",
        "userId":"qe2QqIlOkeWsbljfeF3MsxpSJ9i2",
        "createdTime":1655265807433,
        "text":"ok what\ni did not resolve this intentionally",
        "contractId":"lEoqtnDgJzft6apSKzYK",
        "userName":"Angela",
        "userAvatarUrl":"https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/user-images%2FAngela%2F50463444807_edfd4598d6_o.jpeg?alt=media&token=ef44e13b-2e6c-4498-b9c4-8e38bdaf1476",
        "userUsername":"Angela"
      },
      {
        "userName":"James Grugett",
        "userUsername":"JamesGrugett",
        "id":"F7fvHGhTiFal8uTsUc9P",
        "userAvatarUrl":"https://lh3.googleusercontent.com/a-/AOh14GjC83uMe-fEfzd6QvxiK6ZqZdlMytuHxevgMYIkpAI=s96-c","replyToCommentId":"ZdHIyfQazHyl8nI0ENS7",
        "text":"@Angela Sorry! There was an error that automatically resolved several markets that were created in the last few hours.",
        "createdTime":1655266286514,
        "userId":"5LZ4LgYuySdL1huCWe7bti02ghx2",
        "contractId":"lEoqtnDgJzft6apSKzYK"
      },
      {
        "userId":"qe2QqIlOkeWsbljfeF3MsxpSJ9i2",
        "contractId":"lEoqtnDgJzft6apSKzYK",
        "id":"PIHhXy5hLHSgW8uoUD0Q",
        "userName":"Angela",
        "text":"lmk if anyone lost manna from this situation and i'll try to fix it",
        "userUsername":"Angela",
        "createdTime":1655277581308,
        "userAvatarUrl":"https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/user-images%2FAngela%2F50463444807_edfd4598d6_o.jpeg?alt=media&token=ef44e13b-2e6c-4498-b9c4-8e38bdaf1476"
      },{
        "userAvatarUrl":"https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/user-images%2FAngela%2F50463444807_edfd4598d6_o.jpeg?alt=media&token=ef44e13b-2e6c-4498-b9c4-8e38bdaf1476",
        "userName":"Angela",
        "text":"from my end it looks like no one did",
        "replyToCommentId":"PIHhXy5hLHSgW8uoUD0Q",
        "createdTime":1655287149528,
        "userUsername":"Angela",
        "id":"5slnWEQWwm6dHjDi6oiH",
        "contractId":"lEoqtnDgJzft6apSKzYK",
        "userId":"qe2QqIlOkeWsbljfeF3MsxpSJ9i2"
      }
    ],
    "bets":[
      {
        "outcome":"0",
        "contractId":"lEoqtnDgJzft6apSKzYK",
        "fees":{
          "liquidityFee":0,
          "creatorFee":0,
          "platformFee":0
        },
        "isAnte":true,
        "shares":100,
        "probAfter":1,
        "amount":100,
        "userId":"IPTOzEqrpkWmEzh6hwvAyY9PqFb2",
        "createdTime":1655258914863,
        "probBefore":0,
        "id":"2jNZqnwoEQL7WDTTAWDP"
      },
      {
        "shares":173.20508075688772,
        "fees":{
          "platformFee":0,
          "liquidityFee":0,
          "creatorFee":0
        },
        "contractId":"lEoqtnDgJzft6apSKzYK",
        "probBefore":0,
        "createdTime":1655258941573,
        "loanAmount":0,
        "userId":"qe2QqIlOkeWsbljfeF3MsxpSJ9i2",
        "amount":100,
        "outcome":"1",
        "probAfter":0.75,
        "id":"xuc3JoiNkE8lXPh15mUb"
      },
      {
        "userId":"y1hb6k7txdZPV5mgyxPFApZ7nQl2",
        "contractId":"lEoqtnDgJzft6apSKzYK",
        "loanAmount":0,
        "probAfter":0.009925496893641248,
        "id":"8TBlzPtOdO0q5BgSyRbi",
        "createdTime":1655261198074,
        "shares":20.024984394500787,
        "amount":1,
        "outcome":"2",
        "probBefore":0,
        "fees":{
          "liquidityFee":0,
          "creatorFee":0,
          "platformFee":0
        }
      },
      {
        "probAfter":0.00987648269777473,
        "outcome":"3",
        "id":"9vdwes6s9QxbYZUBhHs4",
        "createdTime":1655263226587,
        "shares":20.074859899884732,
        "amount":1,
        "loanAmount":0,
        "fees":{
          "liquidityFee":0,
          "platformFee":0,
          "creatorFee":0
        },
        "userId":"jbgplxty4kUKIa1MmgZk22byJq03",
        "contractId":"lEoqtnDgJzft6apSKzYK",
        "probBefore":0
      },
      {
        "createdTime":1655264793224,
        "fees":{
          "creatorFee":0,
          "liquidityFee":0,
          "platformFee":0
        },
        "probAfter":0.09211463154147384,
        "amount":10,
        "id":"BehiSGgk1wAkIWz1a8L4",
        "userId":"5LZ4LgYuySdL1huCWe7bti02ghx2",
        "contractId":"lEoqtnDgJzft6apSKzYK",
        "loanAmount":0,
        "probBefore":0,
        "outcome":"4",
        "shares":64.34283176858165
      }
    ]
  }
  ```

    </p>
  </details>

- Response type: A `FullMarket`

  ```tsx
  // A complete market, along with bets, comments, and answers (for free response markets)
  type FullMarket = LiteMarket & {
    bets: Bet[]
    comments: Comment[]
    answers?: Answer[]
  }

  type Bet = {
    id: string
    contractId: string

    amount: number // bet size; negative if SELL bet
    outcome: string
    shares: number // dynamic parimutuel pool weight; negative if SELL bet

    probBefore: number
    probAfter: number

    sale?: {
      amount: number // amount user makes from sale
      betId: string // id of bet being sold
    }

    isSold?: boolean // true if this BUY bet has been sold
    isAnte?: boolean

    createdTime: number
  }
  ```

### `GET /v0/slug/[marketSlug]`

Gets information about a single market by slug (the portion of the URL path after the username).

Requires no authorization.

- Example request
  ```
  https://manifold.markets/api/v0/slug/will-carrick-flynn-win-the-general
  ```
- Response type: A `FullMarket` ; same as above.

### `POST /v0/bet`

Places a new bet on behalf of the authorized user.

Parameters:

- `amount`: Required. The amount to bet, in M$, before fees.
- `contractId`: Required. The ID of the contract (market) to bet on.
- `outcome`: Required. The outcome to bet on. For binary markets, this is `YES`
  or `NO`. For free response markets, this is the ID of the free response
  answer. For numeric markets, this is a string representing the target bucket,
  and an additional `value` parameter is required which is a number representing
  the target value. (Bet on numeric markets at your own peril.)

Example request:

```
$ curl https://manifold.markets/api/v0/bet -X POST -H 'Content-Type: application/json' \
    -H 'Authorization: Key {...}' \
    --data-raw '{"amount":1, \
                 "outcome":"YES", \
                 "contractId":"{...}"}'
```

### `POST /v0/market`

Creates a new market on behalf of the authorized user.

Parameters:

- `outcomeType`: Required. One of `BINARY`, `FREE_RESPONSE`, or `NUMERIC`.
- `question`: Required. The headline question for the market.
- `description`: Required. A long description describing the rules for the market.
- `closeTime`: Required. The time at which the market will close, represented as milliseconds since the epoch.
- `tags`: Optional. An array of string tags for the market.

For binary markets, you must also provide:

- `initialProb`: An initial probability for the market, between 1 and 99.

For numeric markets, you must also provide:

- `min`: The minimum value that the market may resolve to.
- `max`: The maximum value that the market may resolve to.

Example request:

```
$ curl https://manifold.markets/api/v0/market -X POST -H 'Content-Type: application/json' \
    -H 'Authorization: Key {...}'
    --data-raw '{"outcomeType":"BINARY", \
                 "question":"Is there life on Mars?", \
                 "description":"I'm not going to type some long ass example description.", \
                 "closeTime":1700000000000, \
                 "initialProb":25}'
```

## Changelog

- 2022-06-08: Add paging to markets endpoint
- 2022-06-05: Add new authorized write endpoints
- 2022-02-28: Add `resolutionTime` to markets, change `closeTime` definition
- 2022-02-19: Removed user IDs from bets
- 2022-02-17: Released our v0 API, with `/markets`, `/market/[marketId]`, and `/slug/[slugId]`
