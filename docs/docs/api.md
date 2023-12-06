---
id: api
slug: /api
---

# Manifold API

Programatic access to [Manifold](https://manifold.markets).

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

## Usage Guidelines

Feel free to use the API for any purpose you'd like. We ask that you:

- Keep your bets to less than 10 per minute, amortized (transient spikes of over 10/min are okay).
- Keep your reads to less than 100 per second.

## Fees

- A non-refundable transaction fee of M0.25 will be levied on any bet, sell, or limit order placed through the API, or by any account marked as a bot.
- Comments placed through the API will incur a M1 transaction fee.

## Trade history dumps

For data analysis and backtesting purposes, you can bulk download all markets and bets/trades on the platform.

- [Markets dump](https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/trade-dumps%2Fmanifold-dump-markets-04082023.json.zip?alt=media&token=7e18a376-6ac3-4d66-a9a0-552b967f2fe8) (10MB)
- [Bets dump](https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/trade-dumps%2Fmanifold-dump-bets-04082023.zip?alt=media&token=c3ffdfbd-6769-48e3-8cfc-4fc93c2443f3) (436MB)

Last updated: August 8th, 2023

## Endpoints

### `GET /v0/user/[username]`

Gets a user by their username. Remember that usernames may change.

Requires no authorization.

### `GET /v0/user/by-id/[id]`

Gets a user by their unique ID. Many other API endpoints return this as the `userId`.

Requires no authorization.

### `GET /v0/me`

Returns the authenticated user.

### `GET /v0/groups`

Gets all groups, in order of descending creation time, 500 at a time.

Parameters:

- `beforeTime`: Optional. If specified, only groups created before this time
  will be returned.
- `availableToUserId`: Optional. if specified, only groups that the user can
  join and groups they've already joined will be returned.

Requires no authorization.

### `GET /v0/group/[slug]`

Gets a group by its slug.

Requires no authorization.
Note: group is singular in the URL.

### `GET /v0/group/by-id/[id]`

Gets a group by its unique ID.

Requires no authorization.
Note: group is singular in the URL.

### `GET /v0/group/by-id/[id]/markets`

Gets a group's markets by its unique ID.

Requires no authorization.
Note: group is singular in the URL.

### `GET /v0/markets`

Lists all markets, ordered by creation date descending.

Parameters:

- `limit`: Optional. How many markets to return. The maximum is 1000 and the default is 500.
- `before`: Optional. The ID of the market before which the list will start. For
  example, if you ask for the most recent 10 markets, and then perform a second
  query for 10 more markets with `before=[the id of the 10th market]`, you will
  get markets 11 through 20.
- `userId`: Optional. If set, the response will include only markets created by this user.

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
      "url":"https://manifold.markets/Austin/will-i-write-a-new-blog-post-today",
      "pool":146.73022894879944,
      "probability":0.8958175225896258,
      "p":0.08281474972181882,
      "totalLiquidity":102.65696071594805,
      "outcomeType":"BINARY",
      "mechanism":"cpmm-1",
      "volume":241,
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

    // Note: This url always points to https://manifold.markets, regardless of what instance the api is running on.
    // This url includes the creator's username, but this doesn't need to be correct when constructing valid URLs.
    //   i.e. https://manifold.markets/Austin/test-market is the same as https://manifold.markets/foo/test-market
    url: string

    outcomeType: string // BINARY, FREE_RESPONSE, MULTIPLE_CHOICE, NUMERIC, or PSEUDO_NUMERIC
    mechanism: string // dpm-2 or cpmm-1

    probability: number
    pool: { outcome: number } // For CPMM markets, the number of shares in the liquidity pool. For DPM markets, the amount of mana invested in each answer.
    p?: number // CPMM markets only, probability constant in y^p * n^(1-p) = k
    totalLiquidity?: number // CPMM markets only, the amount of mana deposited into the liquidity pool
    value?: number // PSEUDO_NUMERIC markets only, the current market value, which is mapped from probability using min, max, and isLogScale.
    min?: number // PSEUDO_NUMERIC markets only, the minimum resolvable value
    max?: number // PSEUDO_NUMERIC markets only, the maximum resolvable value
    isLogScale?: bool // PSEUDO_NUMERIC markets only, if true `number = (max - min + 1)^probability + minstart - 1`, otherwise `number = min + (max - min) * probability`

    volume: number
    volume24Hours: number

    isResolved: boolean
    resolutionTime?: number
    resolution?: string
    resolutionProbability?: number // Used for BINARY markets resolved to MKT
    uniqueBettorCount: number

    lastUpdatedTime?: number
    lastBetTime?: number
  }
  ```

### `GET /v0/market/[marketId]`

Gets information about a single market by ID. Includes answers, but not bets and
comments. Use `/bets` or `/comments` with a market ID to retrieve bets or
comments.

Requires no authorization.

- Example request

  ```
  https://manifold.markets/api/v0/market/3zspH9sSzMlbFQLn9GKR
  ```

- Example response

  ```json
  {
    "id": "lEoqtnDgJzft6apSKzYK",
    "creatorUsername": "Angela",
    "creatorName": "Angela",
    "createdTime": 1655258914863,
    "creatorAvatarUrl": "https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/user-images%2FAngela%2F50463444807_edfd4598d6_o.jpeg?alt=media&token=ef44e13b-2e6c-4498-b9c4-8e38bdaf1476",
    "closeTime": 1655265001448,
    "question": "What is good?",
    "description": "Resolves proportionally to the answer(s) which I find most compelling. (Obviously I’ll refrain from giving my own answers)\n\n(Please have at it with philosophy, ethics, etc etc)\n\n\nContract resolved automatically.",
    "url": "https://manifold.markets/Angela/what-is-good",
    "pool": null,
    "outcomeType": "FREE_RESPONSE",
    "mechanism": "dpm-2",
    "volume": 112,
    "volume24Hours": 0,
    "isResolved": true,
    "resolution": "MKT",
    "resolutionTime": 1655265001448,
    "answers": [
      {
        "createdTime": 1655258941573,
        "avatarUrl": "https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/user-images%2FAngela%2F50463444807_edfd4598d6_o.jpeg?alt=media&token=ef44e13b-2e6c-4498-b9c4-8e38bdaf1476",
        "id": "1",
        "username": "Angela",
        "number": 1,
        "name": "Angela",
        "contractId": "lEoqtnDgJzft6apSKzYK",
        "text": "ANTE",
        "userId": "qe2QqIlOkeWsbljfeF3MsxpSJ9i2",
        "probability": 0.66749733001068
      },
      {
        "name": "Isaac King",
        "username": "IsaacKing",
        "text": "This answer",
        "userId": "y1hb6k7txdZPV5mgyxPFApZ7nQl2",
        "id": "2",
        "number": 2,
        "avatarUrl": "https://lh3.googleusercontent.com/a-/AOh14GhNVriOvxK2VUAmE-jvYZwC-XIymatzVirT0Bqb2g=s96-c",
        "contractId": "lEoqtnDgJzft6apSKzYK",
        "createdTime": 1655261198074,
        "probability": 0.008922214311142757
      },
      {
        "createdTime": 1655263226587,
        "userId": "jbgplxty4kUKIa1MmgZk22byJq03",
        "id": "3",
        "avatarUrl": "https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/user-images%2FMartin%2Fgiphy.gif?alt=media&token=422ef610-553f-47e3-bf6f-c0c5cc16c70a",
        "text": "Toyota Camry",
        "contractId": "lEoqtnDgJzft6apSKzYK",
        "name": "Undox",
        "username": "Undox",
        "number": 3,
        "probability": 0.008966714133143469
      },
      {
        "number": 4,
        "name": "James Grugett",
        "userId": "5LZ4LgYuySdL1huCWe7bti02ghx2",
        "text": "Utility (Defined by your personal utility function.)",
        "createdTime": 1655264793224,
        "contractId": "lEoqtnDgJzft6apSKzYK",
        "username": "JamesGrugett",
        "id": "4",
        "avatarUrl": "https://lh3.googleusercontent.com/a-/AOh14GjC83uMe-fEfzd6QvxiK6ZqZdlMytuHxevgMYIkpAI=s96-c",
        "probability": 0.09211463154147384
      }
    ]
  }
  ```

- Response type: A `FullMarket`

  ```tsx
  // A complete market, along with answers (for free response markets)
  type FullMarket = LiteMarket & {
    answers?: Answer[] // dpm-2 markets only
    description: JSONContent // Rich text content. See https://tiptap.dev/guide/output#option-1-json
    textDescription: string // string description without formatting, images, or embeds
    groupSlugs?: string[] // groups which the market is a part of
  }
  ```

### `GET /v0/market/[marketId]/positions`

Get positions information about a single market by ID.

Parameters:

- `order` - Optional. The field to order results by. Default: `profit`. Options: `shares` or `profit`,
- `top` - Optional. The number of top positions (ordered by `order`) to return. Default: `null`.
- `bottom` - Optional. The number of bottom positions (ordered by `order`) to return. Default: `null`.
- `userId` - Optional. The user ID to query by. Default: `null`. If provided, only the position for this user will be returned.

Requires no authorization.

- Example request

  ```
  https://manifold.markets/api/v0/market/kupKInoLsjMuiDiNfogm/positions?top=1&bottom=1
  ```

- Example response

  ```json
  [
    {
      "from": {
        "day": {
          "value": 23.479030029570662,
          "profit": 0,
          "invested": 23.479030029570662,
          "prevValue": 23.479030029570662,
          "profitPercent": 0
        },
        "week": {
          "value": 0,
          "profit": 8.479030029570673,
          "invested": 15,
          "prevValue": 0,
          "profitPercent": 56.52686686380448
        },
        "month": {
          "value": 0,
          "profit": 8.479030029570673,
          "invested": 15,
          "prevValue": 0,
          "profitPercent": 56.52686686380448
        }
      },
      "loan": 1.7123642870400002,
      "payout": 23.479030029570673,
      "profit": 8.479030029570673,
      "userId": "IpTiwOTs96VIzeoxu66tfitUcBZ2",
      "invested": 15,
      "userName": "Lucas Goldfein",
      "hasShares": true,
      "contractId": "kupKInoLsjMuiDiNfogm",
      "hasNoShares": true,
      "lastBetTime": 1678924706057,
      "totalShares": {
        "NO": 89.17418492518308
      },
      "hasYesShares": false,
      "userUsername": "LucasGoldfein56b1",
      "profitPercent": 56.52686686380448,
      "userAvatarUrl": "https://lh3.googleusercontent.com/a/AEdFTp5e7cFzq1moc91CKqaAgyEleoNTjtEL9ke8emzV=s96-c",
      "maxSharesOutcome": "NO"
    },
    {
      "from": {
        "day": {
          "value": 5.008090894597479,
          "profit": 0,
          "invested": 5.008090894597479,
          "prevValue": 5.008090894597479,
          "profitPercent": 0
        },
        "week": {
          "value": 0,
          "profit": -4.991909105402519,
          "invested": 10,
          "prevValue": 0,
          "profitPercent": -49.919091054025195
        },
        "month": {
          "value": 0,
          "profit": -4.991909105402519,
          "invested": 10,
          "prevValue": 0,
          "profitPercent": -49.919091054025195
        }
      },
      "loan": 1.14157619136,
      "payout": 5.008090894597481,
      "profit": -4.991909105402519,
      "userId": "JNkmw38JICdw6ySJ9RgWK7WyBdE2",
      "invested": 10,
      "userName": "Sylvie",
      "hasShares": true,
      "contractId": "kupKInoLsjMuiDiNfogm",
      "hasNoShares": true,
      "lastBetTime": 1678914591730,
      "totalShares": {
        "NO": 19.020906016751987
      },
      "hasYesShares": false,
      "userUsername": "sylv",
      "profitPercent": -49.919091054025195,
      "userAvatarUrl": "https://lh3.googleusercontent.com/a/AATXAJyoOZtkrJBItDvRE0HvcRDn8txM-_v033jFIifZ=s96-c",
      "maxSharesOutcome": "NO"
    }
  ]
  ```

- Response type: An array of `ContractMetric`

  ```tsx
  // A single position in a market
  type ContractMetric = {
    contractId: string
    from:
      | {
          // includes, day, week,month
          [period: string]: {
            profit: number
            profitPercent: number
            invested: number
            prevValue: number
            value: number
          }
        }
      | undefined
    hasNoShares: boolean
    hasShares: boolean
    hasYesShares: boolean
    invested: number
    loan: number
    maxSharesOutcome: string | null
    payout: number
    profit: number
    profitPercent: number
    totalShares: {
      [outcome: string]: number
    }
    userId: string
    userUsername: string
    userName: string
    userAvatarUrl: string
    lastBetTime: number
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

### `GET /v0/search-markets`

Search or filter markets, Similar to the [browse page](https://manifold.markets/browse).

Requires no Authorization.

Parameters:

- `term`: Required. the search query in question. Can be empty string.
- `sort`: Optional. `score` (default), `newest`, `liquidity`, or ... (see code)
- `filter`: Optional. Closing state. `all` (default), `open`, `closed`, `resolved`, `closing-this-month`, or `closing-next-month`.
- `contractType`: Optional. `ALL` (default), `BINARY` (yes/no), `MULTIPLE_CHOICE`, `BOUNTY`, `POLL`, or ... (see code)
- `topicSlug`: Optional. Only include questions with the topic tag with this slug.
- `creatorId`: Optional. Only include questions created by the user with this id.
- `limit`: Optional. Number of contracts to return from 0 to 1000. Default 100.
- `offset`: Optional. Number of contracts to skip. Use with limit to paginate the results.

Requires no authorization.

- Example request

  ```
  https://manifold.markets/api/v0/search-markets?term=biden&sort=liquidity&filter=resolved&contractType=BINARY&limit=2
  ```

- Example response

  ```json
  [
    {
      "id": "GF2XuchW9kfFvtTbx3Ps",
      "creatorId": "946iB1LqFIR06G7d8q89um57PHh2",
      "creatorUsername": "egroj",
      "creatorName": "JAAM",
      "createdTime": 1677883374246,
      "creatorAvatarUrl": "https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/user-images%2Fjorge%2F6eta_wBPT5.png?alt=media&token=2d5f9149-6e77-4307-83f7-a770bebe9686",
      "closeTime": 1688137496869,
      "question": "Will student loan payments resume by Sep 1st if SCOTUS permits Biden's student loan forgiveness to proceed?",
      "slug": "will-student-loan-payments-resume-b",
      "url": "https://manifold.markets/egroj/will-student-loan-payments-resume-b",
      "pool": {
        "NO": 37312.24020368579,
        "YES": 5953.602147664982
      },
      "probability": 0.93730169447499,
      "p": 0.7046095540123395,
      "totalLiquidity": 10250,
      "outcomeType": "BINARY",
      "mechanism": "cpmm-1",
      "volume": 42814.582261094794,
      "volume24Hours": 0,
      "isResolved": true,
      "resolution": "CANCEL",
      "resolutionTime": 1688137496869,
      "resolutionProbability": 0.94,
      "uniqueBettorCount": 22,
      "lastUpdatedTime": 1688137484056,
      "lastBetTime": 1688137484056
    },
    {
      "id": "Z8ZE1ivTKqpuIuUlqaNX",
      "creatorId": "3BNoCvJIPOaJvrYM8DQXCQqJVJG3",
      "creatorUsername": "Hyperstition",
      "creatorName": "Hyperstition",
      "createdTime": 1695679507033,
      "creatorAvatarUrl": "https://lh3.googleusercontent.com/a/ACg8ocLYWPycEPnlZAvi3IocdNxOsccwbg8kDM1S8kTHbCRS0w=s96-c",
      "closeTime": 1696882191666,
      "question": "Will there be a finalized US-EU Trade Agreement on Steel by October 31st? [5k Mana Subsidy]",
      "slug": "will-there-be-a-finalized-useu-trad",
      "url": "https://manifold.markets/Hyperstition/will-there-be-a-finalized-useu-trad",
      "pool": {
        "NO": 4460.7051256428695,
        "YES": 6523.627155492219
      },
      "probability": 0.5287578894969781,
      "p": 0.62135002343295,
      "totalLiquidity": 5690,
      "outcomeType": "BINARY",
      "mechanism": "cpmm-1",
      "volume": 3004.9476092964946,
      "volume24Hours": 0,
      "isResolved": true,
      "resolution": "NO",
      "resolutionTime": 1696882191666,
      "resolutionProbability": 0.53,
      "uniqueBettorCount": 34,
      "lastUpdatedTime": 1696887359826,
      "lastBetTime": 1696887359826
    }
  ]
  ```

- Response type: Array of `LiteMarket`.

### `GET /v0/users`

Lists all users, ordered by creation date descending.

Parameters:

- `limit`: Optional. How many users to return. The maximum is 1000 and the default is 500.
- `before`: Optional. The ID of the user before which the list will start. For
  example, if you ask for the most recent 10 users, and then perform a second
  query for 10 more users with `before=[the id of the 10th user]`, you will
  get users 11 through 20.

Requires no authorization.

- Example request
  ```
  https://manifold.markets/api/v0/users?limit=1
  ```
- Example response
  ```json
  [
    {
      "id": "igi2zGXsfxYPgB0DJTXVJVmwCOr2",
      "createdTime": 1639011767273,
      "name": "Austin",
      "username": "Austin",
      "url": "https://manifold.markets/Austin",
      "avatarUrl": "https://lh3.googleusercontent.com/a-/AOh14GiZyl1lBehuBMGyJYJhZd-N-mstaUtgE4xdI22lLw=s96-c",
      "bio": "I build Manifold! Always happy to chat; reach out on Discord or find a time on https://calendly.com/austinchen/manifold!",
      "bannerUrl": "https://images.unsplash.com/photo-1501523460185-2aa5d2a0f981?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1531&q=80",
      "website": "https://blog.austn.io",
      "twitterHandle": "akrolsmir",
      "discordHandle": "akrolsmir#4125",
      "balance": 9122.607163564959,
      "totalDeposits": 10339.004780544328,
      "totalPnLCached": 9376.601262721899
    }
  ]
  ```
- Response type: Array of `LiteUser`

  ```tsx
  // Basic information about a user
  type LiteUser = {
    id: string // user's unique id
    createdTime: number

    name: string // display name, may contain spaces
    username: string // username, used in urls
    url: string // link to user's profile
    avatarUrl?: string

    bio?: string
    bannerUrl?: string
    website?: string
    twitterHandle?: string
    discordHandle?: string

    // Note: the following are here for convenience only and may be removed in the future.
    balance: number
    totalDeposits: number
    totalPnLCached: number
  }
  ```

### `POST /v0/bet`

Places a new bet on behalf of the authorized user.

Parameters:

- `amount`: Required. The amount to bet, in mana, before fees.
- `contractId`: Required. The ID of the contract (market) to bet on.
- `outcome`: Required. The outcome to bet on. For binary markets, this is `YES`
  or `NO`. For free response markets, this is the ID of the free response
  answer. For numeric markets, this is a string representing the target bucket,
  and an additional `value` parameter is required which is a number representing
  the target value. (Bet on numeric markets at your own peril.)
- `limitProb`: Optional. A number between `0.01` and `0.99` inclusive representing
  the limit probability for your bet (i.e. 1% to 99% — multiply by 100 for the
  probability percentage).
  The bet will execute immediately in the direction of `outcome`, but not beyond this
  specified limit. If not all the bet is filled, the bet will remain as an open offer
  that can later be matched against an opposite direction bet.
  - For example, if the current market probability is `50%`:
    - A `M$10` bet on `YES` with `limitProb=0.4` would not be filled until the market
      probability moves down to `40%` and someone bets `M$15` of `NO` to match your
      bet odds.
    - A `M$100` bet on `YES` with `limitProb=0.6` would fill partially or completely
      depending on current unfilled limit bets and the AMM's liquidity. Any remaining
      portion of the bet not filled would remain to be matched against in the future.
  - An unfilled limit order bet can be cancelled using the cancel API.
- `expiresAt`: Optional. A Unix timestamp (in milliseconds) at which the limit bet
  should be automatically canceled.

Example request:

```
$ curl https://manifold.markets/api/v0/bet -X POST -H 'Content-Type: application/json' \
    -H 'Authorization: Key {...}' \
    --data-raw '{"amount":1, \
                 "outcome":"YES", \
                 "contractId":"{...}"}'
```

Response type: A `Bet`.

### `POST /v0/bet/cancel/[id]`

Cancel the limit order of a bet with the specified id. If the bet was unfilled, it will be cancelled so that no other bets will match with it. This action is irreversible.

### `POST /v0/market`

Creates a new market on behalf of the authorized user.

Note: this costs mana. If you have insufficient mana, this call will return an error. The cost to create each type of market is:

| Market Type     | Creation Cost                             |
| --------------- | ----------------------------------------- |
| BINARY          | M$50                                      |
| PSEUDO_NUMERIC  | M$250                                     |
| MULTIPLE_CHOICE | M$25/answer or M$25 for no preset answers |

Parameters:

- `outcomeType`: Required. One of `BINARY`, `MULTIPLE_CHOICE`, `PSEUDO_NUMERIC`, `POLL`, or `BOUNTIED_QUESTION`.
- `question`: Required. The headline question for the market.
- `description`: Optional. A long description describing the rules for the market.
  - Note: string descriptions do **not** turn into links, mentions, formatted text. You may instead use `descriptionMarkdown` or `descriptionHtml` for rich text formatting.
- `closeTime`: Optional. The time at which the market will close, represented as milliseconds since the epoch. Defaults to 7 days from now.
- `visibility`: Optional. One of `public` (default) or `unlisted`. Controls whether the market can be shown on homepage and in search results.
- `groupIds`: Optional. An array of topic/group ids to categorize this market under.

For binary markets, you must also provide:

- `initialProb`: An initial probability for the market, between 1 and 99.

For numeric markets, you must also provide:

- `min`: The minimum value that the market may resolve to.
- `max`: The maximum value that the market may resolve to.
- `isLogScale`: If true, your numeric market will increase exponentially from min to max.
- `initialValue`: An initial value for the market, between min and max, exclusive.

For multiple choice markets, you must also provide:

- `answers`: An array of strings, each of which will be a valid answer for the market.
- `addAnswersMode`: Optional. Controls who can add answers to the market after it has been created. Must be one of `'DISABLED' | 'ONLY_CREATOR' | 'ANYONE'`. Defaults to `'DISABLED'`.

For bountied questions, you must also provide:

- `totalBounty`: The total amount of mana to be distributed to the best answers.

For polls, you must also provide:

- `answers`: An array of strings, each of which will be an option for the poll.

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

### `POST /v0/market/[marketId]/answer`

Adds a valid answer for the market. Currently only supports `MULTIPLE_CHOICE` markets.

- `text`: Required. The answer text.

### `POST /v0/market/[marketId]/add-bounty`

Adds a specified amount to a bounty market.

- `amount`: Required. The amount to add to the bounty, in M$.

### `POST /v0/market/[marketId]/add-liquidity`

Adds a specified amount of liquidity into the market.

- `amount`: Required. The amount of liquidity to add, in M$.

### `POST /v0/market/[marketId]/award-bounty`

Awards a bounty to a specified comment on a bounty market.

- `amount`: Required. The amount of bounty to award, in M$.
- `commentId`: Required. The comment to award the bounty to.

### `POST /v0/market/[marketId]/close`

Closes a market on behalf of the authorized user.

- `closeTime`: Optional. Milliseconds since the epoch to close the market at. If not provided, the market will be closed immediately. Cannot provide close time in the past.

### `POST /v0/market/[marketId]/group`

Add or remove a market to/from a group.

- `groupId`: Required. Id of the group. Must be admin/moderator/creator of group if curated/private. Must be market creator or site moderator if group is public.
- `remove`: Optional. Set to `true` to remove the market from the group.

### `POST /v0/market/[marketId]/resolve`

Resolves a market on behalf of the authorized user.

Parameters:

For binary markets:

- `outcome`: Required. One of `YES`, `NO`, `MKT`, or `CANCEL`.
- `probabilityInt`: Optional. The probability to use for `MKT` resolution.

For free response or multiple choice markets:

- `outcome`: Required. One of `MKT`, `CANCEL`, or a `number` indicating the answer index.
- `resolutions`: An array of `{ answer, pct }` objects to use as the weights for resolving in favor of multiple free response options. Can only be set with `MKT` outcome. Note that the total weights must add to 100.

For numeric markets:

- `outcome`: Required. One of `CANCEL`, or a `number` indicating the selected numeric bucket ID.
- `value`: The value that the market resolves to.
- `probabilityInt`: Required if `value` is present. Should be equal to
  - If log scale: `log10(value - min + 1) / log10(max - min + 1)`
  - Otherwise: `(value - min) / (max - min)`

Example request:

```
# Resolve a binary market
$ curl https://manifold.markets/api/v0/market/{marketId}/resolve -X POST \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Key {...}' \
    --data-raw '{"outcome": "YES"}'

# Resolve a binary market with a specified probability
$ curl https://manifold.markets/api/v0/market/{marketId}/resolve -X POST \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Key {...}' \
    --data-raw '{"outcome": "MKT", \
                 "probabilityInt": 75}'

# Resolve a free response market with a single answer chosen
$ curl https://manifold.markets/api/v0/market/{marketId}/resolve -X POST \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Key {...}' \
    --data-raw '{"outcome": 2}'

# Resolve a free response market with multiple answers chosen
$ curl https://manifold.markets/api/v0/market/{marketId}/resolve -X POST \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Key {...}' \
    --data-raw '{"outcome": "MKT", \
                 "resolutions": [ \
                   {"answer": 0, "pct": 50}, \
                   {"answer": 2, "pct": 50} \
                 ]}'
```

### `POST /v0/market/[marketId]/sell`

Sells some quantity of shares in a binary market on behalf of the authorized user.

Parameters:

- `outcome`: Optional. One of `YES`, or `NO`. If you leave it off, and you only
  own one kind of shares, you will sell that kind of shares.
- `shares`: Optional. The amount of shares to sell of the outcome given
  above. If not provided, all the shares you own will be sold.

Example request:

```
$ curl https://manifold.markets/api/v0/market/{marketId}/sell -X POST \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Key {...}' \
    --data-raw '{"outcome": "YES", "shares": 10}'
```

Response type: A `Bet`, with an additional `"status": "success"` field.

### `POST /v0/comment`

Creates a comment in the specified market. Only supports top-level comments for now.

Parameters:

- `contractId`: Required. The ID of the market to comment on.
- `content`: The comment to post, formatted as [TipTap json](https://tiptap.dev/guide/output#option-1-json), OR
- `html`: The comment to post, formatted as an HTML string, OR
- `markdown`: The comment to post, formatted as a markdown string.

### `GET /v0/comments`

Gets a list of comments for a contract, ordered by creation date descending.

Parameters:

- `contractId`: Optional. Which contract to read comments for. Either an ID or slug must be specified.
- `contractSlug`: Optional.
- `userId`: Optional. If set, the response will include only comments created by this user.

Requires no authorization.

### `GET /v0/bets`

Gets a list of bets, ordered by creation date descending.

Parameters:

- `userId`: Optional. If set, the response will include only bets created by this user.
- `username`: Optional. If set, the response will include only bets created by this user.
- `contractId`: Optional. If set, the response will only include bets on this contract.
- `contractSlug`: Optional. If set, the response will only include bets on this contract.
- `limit`: Optional. How many bets to return. The maximum and the default are 1000.
- `before`: Optional. The ID of the bet before which the list will start. For
  example, if you ask for the most recent 10 bets, and then perform a second
  query for 10 more bets with `before=[the id of the 10th bet]`, you will
  get bets 11 through 20.
- `after`: Optional. The ID of the bet after which the list will start. For example, if you request the 10 most recent bets and then perform a second query with after=[the id of the 1st bet], you will receive up to 10 new bets, if available.
- `kinds`: Optional. Specifies subsets of bets to return. Possible kinds: `open-limit` (open limit orders.)
- `order`: Optional. The sorting order for returned bets. Accepts desc or asc. Default is desc.

Requires no authorization.

- Example request
  ```
  https://manifold.markets/api/v0/bets?username=Manifold&contractSlug=will-i-be-able-to-place-a-limit-ord
  ```
- Response type: A `Bet[]`.

- Example response

  ```json
  [
    // Limit bet, partially filled.
    {
      "isFilled": false,
      "amount": 15.596681605353808,
      "userId": "IPTOzEqrpkWmEzh6hwvAyY9PqFb2",
      "contractId": "Tz5dA01GkK5QKiQfZeDL",
      "probBefore": 0.5730753474948571,
      "isCancelled": false,
      "outcome": "YES",
      "fees": { "creatorFee": 0, "liquidityFee": 0, "platformFee": 0 },
      "shares": 31.193363210707616,
      "limitProb": 0.5,
      "id": "yXB8lVbs86TKkhWA1FVi",
      "loanAmount": 0,
      "orderAmount": 100,
      "probAfter": 0.5730753474948571,
      "createdTime": 1659482775970,
      "fills": [
        {
          "timestamp": 1659483249648,
          "matchedBetId": "MfrMd5HTiGASDXzqibr7",
          "amount": 15.596681605353808,
          "shares": 31.193363210707616
        }
      ]
    },
    // Normal bet (no limitProb specified).
    {
      "shares": 17.350459904608414,
      "probBefore": 0.5304358279113885,
      "isFilled": true,
      "probAfter": 0.5730753474948571,
      "userId": "IPTOzEqrpkWmEzh6hwvAyY9PqFb2",
      "amount": 10,
      "contractId": "Tz5dA01GkK5QKiQfZeDL",
      "id": "1LPJHNz5oAX4K6YtJlP1",
      "fees": {
        "platformFee": 0,
        "liquidityFee": 0,
        "creatorFee": 0.4251333951457593
      },
      "isCancelled": false,
      "loanAmount": 0,
      "orderAmount": 10,
      "fills": [
        {
          "amount": 10,
          "matchedBetId": null,
          "shares": 17.350459904608414,
          "timestamp": 1659482757271
        }
      ],
      "createdTime": 1659482757271,
      "outcome": "YES"
    }
  ]
  ```

### `GET /v0/managrams`

Gets a list of managrams, ordered by creation time descending.

Parameters

- `toId`: Optional. Returns managrams sent to this user.
- `fromId`: Optional. Returns managrams sent from this user.
- `limit`: Optional. How many managrams to return. The maximum and the default are 100.
- `before`: Optional. The `createdTime` before which you want managrams
- `after`: Optional. The `createdTime` after which you want managrams

Requires no authorization.

Example request

```
https://manifold.markets/api/v0/managrams?toId=IPTOzEqrpkWmEzh6hwvAyY9PqFb2
```

Example response

```json
[
  {
    "id": "INKcoBUVT914i1XUJ6rG",
    "data": {
      "groupId": "e097e0c5-3ce0-4eb2-9ca7-6554f86b84cd",
      "message": "Puzzles for Progress",
      "visibility": "public"
    },
    "toId": "AJwLWoo3xue32XIiAVrL5SyR1WB2",
    "token": "M$",
    "amount": 2500,
    "fromId": "jO7sUhIDTQbAJ3w86akzncTlpRG2",
    "toType": "USER",
    "category": "MANA_PAYMENT",
    "fromType": "USER",
    "createdTime": 1695665438987,
    "description": "Mana payment 2500 from MichaelWheatley to jO7sUhIDTQbAJ3w86akzncTlpRG2"
  },
  {
    "id": "crFuofkDd8gcpbEEFfcY",
    "data": {
      "groupId": "b8fea716-186b-4bef-9a19-7bc90c16c9e9",
      "message": "Thank you for running the music and the great time!! ",
      "visibility": "public"
    },
    "toId": "AJwLWoo3xue32XIiAVrL5SyR1WB2",
    "token": "M$",
    "amount": 500,
    "fromId": "uLhlcRUBUpSnmqp2L0PJRuxbvku2",
    "toType": "USER",
    "category": "MANA_PAYMENT",
    "fromType": "USER",
    "createdTime": 1695604111711,
    "description": "Mana payment 500 from AdriaGarrigaAlonso to uLhlcRUBUpSnmqp2L0PJRuxbvku2"
  }
]
```

### `POST /v0/managram`

Send a managram to another user.

Parameters

- `toIds`: Required. An array of user ids to send managrams to.
- `amount`: Required. The amount of mana (must be >= 10) to send to each user.
- `message`: Optional. A message to include with the managram.

Example body

```json
{
  "amount": 10,
  "toIds": ["AJwLWoo3xue32XIiAVrL5SyR1WB2"],
  "message": "hi!"
}
```

## Changelog

- 2023-10-27: Update `/search-markets` to allow all the same search options as our search.
- 2023-09-29: Add `/managrams` and `/managram` endpoints
- 2023-05-15: Change the response of the `/market/{marketId}/sell` POST endpoint from
  `{"status": "success"}` to a full `Bet`, with an additional `"status": "success"` field.
- 2023-04-03: Add `/market/[marketId]/group` POST endpoint.
- 2023-03-21: Add `/market/[marketId]/positions` and `/search-markets` endpoints
- 2022-11-22: Update /market GET to remove `bets` and `comments`
- 2022-10-17: Update /market POST to allow `visibility` and `groupId`; mark `closeTime` as optional; remove `tags`
- 2022-09-24: Expand market POST docs to include new market types (`PSEUDO_NUMERIC`, `MULTIPLE_CHOICE`)
- 2022-07-15: Add user by username and user by ID APIs
- 2022-06-08: Add paging to markets endpoint
- 2022-06-05: Add new authorized write endpoints
- 2022-02-28: Add `resolutionTime` to markets, change `closeTime` definition
- 2022-02-19: Removed user IDs from bets
- 2022-02-17: Released our v0 API, with `/markets`, `/market/[marketId]`, and `/slug/[slugId]`
