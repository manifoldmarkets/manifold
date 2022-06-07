// Existing contracts don't have auto resolutions (Time + resolution). Let's add them.

import * as admin from 'firebase-admin'

import { initAdmin } from './script-init'
initAdmin()

import { getValues } from '../utils'
import { Contract } from '../../../common/contract'
import { DAY_MS } from '../../../common/util/time'

const firestore = admin.firestore()

async function addAutoResolutionToContracts() {
  console.log('Adding auto resolution to existing contracts')

  const contracts = await getValues<Contract>(
    firestore.collection('contracts').where('isResolved', '==', false)
  )

  console.log('Loaded', contracts.length, 'contracts')

  await Promise.all(contracts.map((c) => addAutoResolutionToContract(c)))
}

async function addAutoResolutionToContract(contract: Contract) {
  const contractRef = firestore.doc(`contracts/${contract.id}`)
  if (contract.autoResolutionTime && contract.autoResolution) {
    console.log('Skipping, already has auto resolution', contract.slug)
    return
  }
  if (contract.autoResolutionTime || contract.autoResolution) {
    console.error(
      'Has partial auto resolution, please check manually',
      contract.slug
    )
    return
  }
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
    autoResolution: 'MKT',
    autoResolutionTime: autoResolutionTime,
  } as Partial<Contract>)
}

if (require.main === module)
  addAutoResolutionToContracts().then(() => process.exit())
