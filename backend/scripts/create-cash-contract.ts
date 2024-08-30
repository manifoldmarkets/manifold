import { runScript } from './run-script'
import { createCashContractMain } from '../shared/src/create-cash-contract'

runScript(async ({ pg }) => {
  const manaContractId = process.argv[2]
  const subsidyAmount = parseFloat(process.argv[3])

  if (!manaContractId || isNaN(subsidyAmount)) {
    console.error(
      'Usage: ts-node create-cash-contract.ts <mana_contract_id> <subsidy_amount>'
    )
    process.exit(1)
  }

  try {
    const cashContract = await createCashContractMain(
      pg,
      manaContractId,
      subsidyAmount
    )
    console.log('Success ' + cashContract.id)
  } catch (error) {
    console.error('Error creating cash contract:', error)
  }
})
