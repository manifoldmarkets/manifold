import { initAdmin } from 'shared/init-admin'
initAdmin()

import { run } from 'common/supabase/utils'
import { createSupabaseClient } from 'shared/supabase/init'
import { generateEmbeddings } from 'shared/helpers/openai-utils'

const db = createSupabaseClient()

async function main() {
  const result = await run(db.from('contract_embeddings').select('contract_id'))

  const contractIds = new Set(result.data.map((row: any) => row.contract_id))
  console.log('Got', contractIds.size, 'markets with preexisting embeddings')

  const { data: contracts } = await run(
    db
      .from('contracts')
      .select('id, data')
      .not('id', 'in', '(' + [...contractIds].join(',') + ')')
  )

  console.log('Got', contracts.length, 'markets to process')

  for (const contract of contracts) {
    const { id, data } = contract
    const { question } = data as { question: string }
    const embedding = await generateEmbeddings(question)
    if (!embedding || embedding.length < 1500) {
      console.log('No embeddings for', question)
      continue
    }

    console.log('Generated embeddings for', id, ':', question)

    await run(
      db
        .from('contract_embeddings')
        .upsert({ contract_id: id, embedding, created_at: Date.now() })
    ).catch((err) => console.error(err))
  }
}

if (require.main === module) {
  main().then(() => process.exit())
}
