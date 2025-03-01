import { runScript } from './run-script'
import { createCashContractMain } from '../shared/src/create-cash-contract'
import { HOUSE_LIQUIDITY_PROVIDER_ID } from 'common/antes'

runScript(async () => {
  const manaContractId = process.argv[2]
  const subsidyAmount = parseFloat(process.argv[3])

  if (!manaContractId || isNaN(subsidyAmount) || subsidyAmount <= 0) {
    console.error(
      'Usage: ts-node create-cash-contract.ts <mana_contract_id> <subsidy_amount>'
    )
    process.exit(1)
  }

  try {
    const cashContract = await createCashContractMain(
      manaContractId,
      subsidyAmount,
      HOUSE_LIQUIDITY_PROVIDER_ID
    )
    console.log('Success ' + cashContract.id)
  } catch (error) {
    console.error('Error creating cash contract:', error)
  }
})
