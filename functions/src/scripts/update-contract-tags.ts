import * as admin from 'firebase-admin'
import * as _ from 'lodash'

import { initAdmin } from './script-init'
initAdmin()

import { Contract } from '../../../common/contract'
import { parseTags } from '../../../common/util/parse'
import { getValues } from '../utils'

async function updateContractTags() {
  const firestore = admin.firestore()
  console.log('Updating contracts tags')

  const contracts = await getValues<Contract>(firestore.collection('contracts'))

  console.log('Loaded', contracts.length, 'contracts')

  for (const contract of contracts) {
    const contractRef = firestore.doc(`contracts/${contract.id}`)

    const tags = _.uniq([
      ...parseTags(contract.question + contract.description),
      ...(contract.tags ?? []),
    ])
    const lowercaseTags = tags.map((tag) => tag.toLowerCase())

    console.log(
      'Updating tags',
      contract.slug,
      'from',
      contract.tags,
      'to',
      tags
    )

    await contractRef.update({
      tags,
      lowercaseTags,
    } as Partial<Contract>)
  }
}

if (require.main === module) {
  updateContractTags().then(() => process.exit())
}
