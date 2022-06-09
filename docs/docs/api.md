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

- `n`: Optional. How many markets to return. The maximum and the default is 1000.
- `before`: Optional. The ID of the market before which the list will start. For
  example, if you ask for the most recent 10 markets, and then perform a second
  query for 10 more markets with `before=[the id of the 10th market]`, you will
  get markets 11 through 20.

Requires no authorization.

- Example request
  ```
  http://manifold.markets/api/v0/markets?n=1
  ```
- Example response
  ```json
  [
    {
      "id":"FKtYX3t8ZfIp5gytJWAI",
      "creatorUsername":"JamesGrugett",
      "creatorName":"James Grugett",
      "createdTime":1645139406452,
      "closeTime":1647406740000,
      "question":"What will be the best assessment of the Free response feature on March 15th?",
      "description":"Hey guys, let's try this out!\nWe will see how people use the new Free response market type over the next month. Then I will pick the answer that I think best describes the consensus view of this feature on March 15th. Cheers.",
      "tags":[
        "ManifoldMarkets"
      ],
      "url":"https://manifold.markets/JamesGrugett/what-will-be-the-best-assessment-of",
      "pool":null,
      "probability":0,
      "volume7Days":100,
      "volume24Hours":100,
      "isResolved":false,
      ...
    }
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
    createdTime: number
    creatorAvatarUrl?: string

    // Market attributes. All times are in milliseconds since epoch
    closeTime?: number // Min of creator's chosen date, and resolutionTime
    question: string
    description: string
    tags: string[]
    url: string

    pool: number
    probability: number
    volume7Days: number
    volume24Hours: number
    isResolved: boolean
    resolutionTime?: number
    resolution?: string
  }
  ```

### `GET /v0/market/[marketId]`

Gets information about a single market by ID.

Requires no authorization.

- Example request

  ```
  https://manifold.markets/api/v0/market/3zspH9sSzMlbFQLn9GKR
  ```

- <details><summary>Example response</summary><p>

  ```json
  {
    "id": "3zspH9sSzMlbFQLn9GKR",
    "creatorUsername": "Austin",
    "creatorName": "Austin Chen",
    "createdTime": 1644103005345,
    "closeTime": 1667894340000,
    "question": "Will Carrick Flynn win the general election for Oregon's 6th District?",
    "description": "The Effective Altruism movement usually stays out of politics, but here is a recent, highly-upvoted endorsement of donating to Carrick Flynn as a high-impact area: https://forum.effectivealtruism.org/posts/Qi9nnrmjwNbBqWbNT/the-best-usd5-800-i-ve-ever-donated-to-pandemic-prevention\nFurther reading: https://ballotpedia.org/Oregon%27s_6th_Congressional_District_election,_2022\n\n#EffectiveAltruism #Politics",
    "tags": ["EffectiveAltruism", "Politics"],
    "url": "https://manifold.markets/Austin/will-carrick-flynn-win-the-general",
    "pool": 400.0916328426886,
    "probability": 0.34455568984059187,
    "volume7Days": 326.9083671573114,
    "volume24Hours": 0,
    "isResolved": false,
    "bets": [
      {
        "createdTime": 1644103005345,
        "isAnte": true,
        "shares": 83.66600265340756,
        "userId": "igi2zGXsfxYPgB0DJTXVJVmwCOr2",
        "amount": 70,
        "probAfter": 0.3,
        "probBefore": 0.3,
        "id": "E1MjiVYBM0GkqRXhv5cR",
        "outcome": "NO",
        "contractId": "3zspH9sSzMlbFQLn9GKR"
      },
      {
        "contractId": "3zspH9sSzMlbFQLn9GKR",
        "probAfter": 0.3,
        "shares": 54.77225575051661,
        "userId": "igi2zGXsfxYPgB0DJTXVJVmwCOr2",
        "isAnte": true,
        "createdTime": 1644103005345,
        "id": "jn3iIGwD5f0vxOHxo62o",
        "amount": 30,
        "probBefore": 0.3,
        "outcome": "YES"
      },
      {
        "shares": 11.832723364874056,
        "probAfter": 0.272108843537415,
        "userId": "PkBnU8cAZiOLa0fjxiUzMKsFMYZ2",
        "contractId": "3zspH9sSzMlbFQLn9GKR",
        "outcome": "NO",
        "amount": 10,
        "id": "f6sHBab6lbGw9PsnVXdc",
        "probBefore": 0.3,
        "createdTime": 1644203305863
      },
      {
        "userId": "BTksWMdCeHfDitWVaAZdjLSdu3o1",
        "amount": 10,
        "id": "Vfui2KOQwy7gkRPP7xc6",
        "shares": 18.12694184700382,
        "outcome": "YES",
        "createdTime": 1644212358699,
        "contractId": "3zspH9sSzMlbFQLn9GKR",
        "probBefore": 0.272108843537415,
        "probAfter": 0.3367768595041322
      },
      {
        "contractId": "3zspH9sSzMlbFQLn9GKR",
        "probAfter": 0.3659259259259259,
        "userId": "BTksWMdCeHfDitWVaAZdjLSdu3o1",
        "probBefore": 0.3367768595041322,
        "amount": 5,
        "outcome": "YES",
        "createdTime": 1644433184238,
        "id": "eGI1VwAWF822LkcmOUot",
        "shares": 8.435122540124937
      },
      {
        "userId": "NHA7Gv9nNpb7b60GpLD3oFkBvPa2",
        "shares": 59.79133423528123,
        "amount": 50,
        "probAfter": 0.24495867768595042,
        "contractId": "3zspH9sSzMlbFQLn9GKR",
        "createdTime": 1644693685223,
        "probBefore": 0.3659259259259259,
        "id": "fbU0DbmDWMnubggpQotw",
        "outcome": "NO"
      },
      {
        "amount": 25,
        "userId": "iXw2OSyhs0c4QW2fAfK3yqmaYDv1",
        "probAfter": 0.20583333333333328,
        "outcome": "NO",
        "shares": 28.3920247989266,
        "contractId": "3zspH9sSzMlbFQLn9GKR",
        "createdTime": 1644695698202,
        "id": "k9hyljJD3MMXK2OYxTsR",
        "probBefore": 0.24495867768595042
      },
      {
        "createdTime": 1644716782308,
        "shares": 11.17480183821209,
        "probBefore": 0.20583333333333328,
        "userId": "clvYFhVDzccYu20OUc5NBKJyDxj2",
        "probAfter": 0.1927679500520291,
        "id": "yYkZ4JpLgZHrRQUugpCD",
        "outcome": "NO",
        "contractId": "3zspH9sSzMlbFQLn9GKR",
        "amount": 10
      },
      {
        "contractId": "3zspH9sSzMlbFQLn9GKR",
        "outcome": "YES",
        "amount": 30,
        "id": "IU2Hb1DesgKIN140BkhE",
        "shares": 58.893424111838016,
        "createdTime": 1644736846538,
        "probBefore": 0.1927679500520291,
        "userId": "BTksWMdCeHfDitWVaAZdjLSdu3o1",
        "probAfter": 0.3289359861591695
      },
      {
        "isSold": true,
        "userId": "5zeWhzi9nlNNf5C9TVjshAN7QOd2",
        "createdTime": 1644751343436,
        "outcome": "NO",
        "contractId": "3zspH9sSzMlbFQLn9GKR",
        "amount": 25,
        "probBefore": 0.3289359861591695,
        "id": "fkCxVH7THaDbEhyJjXVk",
        "probAfter": 0.2854194032651529,
        "shares": 30.022082866721178
      },
      {
        "probAfter": 0.2838618650900295,
        "id": "Ao05LRRMXVWw8d7LtwhL",
        "outcome": "NO",
        "probBefore": 0.2854194032651529,
        "shares": 1.1823269994736165,
        "userId": "pUF3dMs9oLNpgU2LYtFmodaoDow1",
        "amount": 1,
        "contractId": "3zspH9sSzMlbFQLn9GKR",
        "createdTime": 1644768321860
      },
      {
        "id": "LJ8H8DTuK7CH9vN3u0Sd",
        "createdTime": 1644771352663,
        "shares": 113.5114039238785,
        "probAfter": 0.17510453314667793,
        "outcome": "NO",
        "amount": 100,
        "probBefore": 0.2838618650900295,
        "contractId": "3zspH9sSzMlbFQLn9GKR",
        "userId": "ebX5nzwrs8V0M5UynWvbtcj7KAI2"
      },
      {
        "outcome": "YES",
        "amount": 20,
        "probBefore": 0.17510453314667793,
        "id": "TECEF9I5FqTqt6uTIsJX",
        "contractId": "3zspH9sSzMlbFQLn9GKR",
        "createdTime": 1644805061501,
        "shares": 43.88281646028875,
        "userId": "lHxg3179e4amWm5LJhJoJrcWK482",
        "probAfter": 0.24160019644701852
      },
      {
        "amount": -25.908367157311375,
        "id": "G3u2EzETWOyrGo15wtiQ",
        "outcome": "NO",
        "createdTime": 1644847494264,
        "sale": {
          "betId": "fkCxVH7THaDbEhyJjXVk",
          "amount": 25.862948799445807
        },
        "probAfter": 0.26957595409437557,
        "shares": -30.022082866721178,
        "probBefore": 0.24160019644701852,
        "contractId": "3zspH9sSzMlbFQLn9GKR",
        "userId": "5zeWhzi9nlNNf5C9TVjshAN7QOd2"
      },
      {
        "createdTime": 1644853733891,
        "userId": "lbTXACtCnIacKDloKfXxYkDn0zM2",
        "amount": 10,
        "id": "z443uCkbYRLZW9QdXu1u",
        "probAfter": 0.25822886066938844,
        "contractId": "3zspH9sSzMlbFQLn9GKR",
        "outcome": "NO",
        "shares": 11.655141043149968,
        "probBefore": 0.26957595409437557
      },
      {
        "userId": "BTksWMdCeHfDitWVaAZdjLSdu3o1",
        "amount": 15,
        "shares": 28.311399392675895,
        "id": "axoryV664uzHZ0jzWSXR",
        "outcome": "YES",
        "probBefore": 0.25822886066938844,
        "contractId": "3zspH9sSzMlbFQLn9GKR",
        "createdTime": 1644863335939,
        "probAfter": 0.3033936853512369
      },
      {
        "createdTime": 1644987330420,
        "id": "jHAYDdZRkDw3lFoDXdmm",
        "shares": 26.353902809992064,
        "userId": "BTksWMdCeHfDitWVaAZdjLSdu3o1",
        "contractId": "3zspH9sSzMlbFQLn9GKR",
        "probAfter": 0.34455568984059187,
        "probBefore": 0.3033936853512369,
        "amount": 15,
        "outcome": "YES"
      }
    ],
    "comments": [
      {
        "contractId": "3zspH9sSzMlbFQLn9GKR",
        "userUsername": "Celer",
        "userAvatarUrl": "https://lh3.googleusercontent.com/a/AATXAJwp0vAolZgOmT7GbzFq7mOf8lr0BFEB_LqWWfZk=s96-c",
        "userId": "NHA7Gv9nNpb7b60GpLD3oFkBvPa2",
        "text": "It's a D+3 district, and the person we're pushing is functionally an outsider. I maxed my donation, but 25%, what I bought down to, implying even odds on both the general and the primary, seems if anything optimistic.",
        "createdTime": 1644693740967,
        "id": "fbU0DbmDWMnubggpQotw",
        "betId": "fbU0DbmDWMnubggpQotw",
        "userName": "Celer"
      }
    ]
  }
  ```

    </p>
  </details>

- Response type: A `FullMarket`

  ```tsx
  // A complete market, along with bets and comments
  type FullMarket = LiteMarket & {
    bets: Bet[]
    comments: Comment[]
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
                 initialProb:25}'
```

## Changelog

- 2022-06-08: Add paging to markets endpoint
- 2022-06-05: Add new authorized write endpoints
- 2022-02-28: Add `resolutionTime` to markets, change `closeTime` definition
- 2022-02-19: Removed user IDs from bets
- 2022-02-17: Released our v0 API, with `/markets`, `/market/[marketId]`, and `/slug/[slugId]`
