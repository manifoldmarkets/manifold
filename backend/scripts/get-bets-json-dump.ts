import * as fs from 'fs'
import { runScript } from 'run-script'
import { Bet } from 'common/bet'

const PAGE_SIZE = 100000 // Adjust this value based on your system's memory constraints
const OUTPUT_FILE = 'bets.json'

if (require.main === module)
  runScript(async ({ pg }) => {
    let offset = 0
    let totalBets = 0
    let hasMoreRows = true

    // Create or clear the output file
    fs.writeFileSync(OUTPUT_FILE, '[\n', { flag: 'w' })

    while (hasMoreRows) {
      const bets = await pg.map(
        `SELECT data FROM contract_bets
        WHERE is_redemption = false
        ORDER BY created_time ASC
        LIMIT $1 OFFSET $2`,
        [PAGE_SIZE, offset],
        (row) => row.data as Bet
      )

      hasMoreRows = bets.length === PAGE_SIZE
      offset += bets.length
      totalBets += bets.length

      const trimmedBets = bets.map((bet) => {
        const {
          isRedemption,
          isAnte,
          visibility,
          isChallenge,
          userAvatarUrl,
          userName,
          userUsername,
          ...trimmedBet
        } = bet as Bet & {
          userAvatarUrl: string
          userName: string
          userUsername: string
        }
        return trimmedBet
      })

      // Append the trimmed bets to the file
      const betString = JSON.stringify(trimmedBets, null, 2)
        .slice(1, -1) // Remove the opening and closing brackets
        .trim()

      fs.appendFileSync(OUTPUT_FILE, betString)

      // Add a comma if there are more rows to come
      if (hasMoreRows) {
        fs.appendFileSync(OUTPUT_FILE, ',\n')
      } else {
        fs.appendFileSync(OUTPUT_FILE, '\n')
      }

      console.log(`Processed ${totalBets} bets`)
    }

    // Close the JSON array
    fs.appendFileSync(OUTPUT_FILE, ']')

    console.log(`Total bets exported: ${totalBets}`)
    console.log(`Bets saved to ${OUTPUT_FILE}`)
  })
