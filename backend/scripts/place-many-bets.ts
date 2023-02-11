import { initAdmin } from 'shared/init-admin'
import fetch from 'node-fetch'

async function placeManyBets(apiKey: string, count: number) {
  const url = 'https://placebet-w3txbmd3ba-uc.a.run.app'

  const betData = {
    contractId: 'pdcWgwpzV4RsJjQGVq9v', // https://dev.manifold.markets/IanPhilips/beeeep-bop
    amount: 10,
    outcome: 'NO',
  }
  let success = 0
  let failure = 0
  const promises = []
  const start = Date.now()
  console.log(
    `Placing ${count} bets  at ${url} on contract ${betData.contractId}.`
  )
  const errorMessage: { [key: string]: number } = {}
  for (let i = 0; i < count; i++) {
    const resp = fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(betData),
    })
      .then(async (resp) => {
        const json = await resp.json()
        if (resp.status === 200) {
          success++
        } else {
          errorMessage[json.message] = errorMessage[json.message]
            ? errorMessage[json.message] + 1
            : 1
          failure++
        }
      })
      .catch(() => {
        failure++
      })
    promises.push(resp)
  }
  await Promise.all(promises)
  const end = Date.now()
  Object.entries(errorMessage).map(([key, value]) => {
    console.log(`Error seen: ${key} (${value} times)`)
  })
  console.log(
    `Tried placing ${count} bets: Success: ${success}, Failure: ${failure} in ${
      end - start
    }ms`
  )
}

if (require.main === module) {
  initAdmin()
  const args = process.argv.slice(2)
  if (args.length != 2) {
    console.log('Usage: place-many-bets [apikey] [number-of-bets-to-place]')
  } else {
    placeManyBets(args[0], parseInt(args[1])).catch((e) => console.error(e))
  }
}
