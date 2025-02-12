import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateContract } from 'shared/supabase/contracts'
import { log } from 'shared/utils'

const MARCH_3RD_2025 = new Date('2025-03-03').toISOString()

async function closeCashMarkets() {
  const pg = createSupabaseDirectClient()

  // Find all cash markets created after March 3rd that aren't already closed
  const contracts = await pg.map(
    `SELECT id FROM contracts 
     WHERE token = 'CASH' 
     AND (close_time IS NULL OR close_time > $1)`,
    [MARCH_3RD_2025],
    (r) => r.id
  )

  log(`Found ${contracts.length} cash markets to close`)

  // Close each contract
  for (const contractId of contracts) {
    try {
      await updateContract(pg, contractId, {
        closeTime: Date.now(),
      })
      log(`Closed contract ${contractId}`)
    } catch (error) {
      log(`Error closing contract ${contractId}: ${error}`)
    }
  }

  log('Finished closing cash markets')
  // TODO: Turn off cash issuances [done]
  // TODO: remove sweep prices & add mana shop prices [done]
  // TODO: turn off verifications/registrations [done]
  // TODO: set redeemable to cash balance [done]
  // TODO: add banner that links to mana forever announcement [done]
  // TODO: remove sweeps from signup flow [done]
  // TODO: remove sweeps panel on contract page[done]
  // TODO: remove sweeps offer from sidebar [done]
  // TODO: remove referral notification [done]
}

// Run the script
closeCashMarkets().catch(console.error)
