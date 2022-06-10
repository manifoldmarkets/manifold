// Existing contracts don't have auto resolutions. Let's add it.

import * as admin from 'firebase-admin'

import { initAdmin } from './script-init'
initAdmin()

import { getValues } from '../utils'
import { Contract } from '../../../common/contract'
import { DAY_MS } from '../../../common/util/time'
import { batchedWaitAll } from '../../../common/util/promise'

const firestore = admin.firestore()

async function addAutoResolutionToContracts() {
  console.log('Adding auto resolution to existing contracts')

  const contracts = await getValues<Contract>(
    firestore.collection('contracts').where('isResolved', '==', false)
  )

  console.log('Loaded', contracts.length, 'contracts')

  await batchedWaitAll(
    contracts.map((c) => () => addAutoResolutionToContract(c))
  )
}

async function addAutoResolutionToContract(contract: Contract) {
  if (contract.autoResolutionTime) {
    console.log('Skipping, already has auto resolution', contract.slug)
    return
  }
  const contractRef = firestore.doc(`contracts/${contract.id}`)
  if (!contract.closeTime) {
    console.error('Has no close time, please check manually', contract.slug)
    return
  }

  const autoResolutionTime =
    contract.closeTime > Date.now()
      ? contract.closeTime + 7 * DAY_MS
      : Date.now() + 14 * DAY_MS

  console.log('Adding auto resolution', contract.slug)

  await contractRef.update({
    autoResolutionTime: autoResolutionTime,
  } as Partial<Contract>)
}

if (require.main === module)
  addAutoResolutionToContracts().then(() => process.exit())
