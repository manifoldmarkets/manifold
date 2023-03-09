import * as admin from 'firebase-admin'

import { initAdmin } from 'shared/init-admin'
initAdmin()

import { run } from 'common/supabase/utils'
import { Contract } from 'common/contract'
import { createSupabaseClient } from 'shared/supabase/init'
import { generateEmbeddings } from 'shared/helpers/openai-utils'

const firestore = admin.firestore()
const db = createSupabaseClient()

async function main() {
  const result = await run(db.from('contract_embeddings').select('contract_id'))

  const contractIds = new Set(result.data.map((row: any) => row.contract_id))
  console.log('Got', contractIds.size, 'markets with preexisting embeddings')

  const snapshot = await firestore
    .collection('contracts')
    .orderBy('popularityScore', 'desc')
    .get()

  const contracts = snapshot.docs
    .map((doc) => doc.data() as Contract)
    .filter((c) => !contractIds.has(c.id))

  console.log('Got', contracts.length, 'markets to process')

  for (const contract of contracts) {
    const { id, question } = contract
    const embedding = await generateEmbeddings(question)
    if (!embedding) {
      console.log('No embeddings for', question)
      continue
    }

    console.log('Generated', embedding?.length, 'embeddings for', question)

    await run(
      db.from('contract_embeddings').upsert({ contract_id: id, embedding })
    )
  }
}

if (require.main === module) {
  main().then(() => process.exit())
}
