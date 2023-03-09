import * as admin from 'firebase-admin'
import { initAdmin } from './script-init'

initAdmin()

import { generateEmbeddings } from '../helpers/openai-utils'
import { createSupabaseClient } from '../supabase/init'
import { run } from 'common/supabase/utils'
import { Contract } from 'common/contract'
import { closestEmbeddingById, saveVector } from '../helpers/pinecone-utils'

const firestore = admin.firestore()
const db = createSupabaseClient()

async function main() {
  const blah = await closestEmbeddingById('zoMnPLYgOjpR6enGyI8E')
  console.log('blah', blah)

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
    const embeddings = await generateEmbeddings(question)
    if (!embeddings) {
      console.log('No embeddings for', question)
      continue
    }

    console.log('Generated', embeddings?.length, 'embeddings for', question)
    await saveVector(id, embeddings)

    await run(
      db
        .from('contract_embeddings')
        .upsert({ contract_id: id, embeddings: embeddings })
    )
  }
}

if (require.main === module) {
  main().then(() => process.exit())
}
