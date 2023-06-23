import { initAdmin } from 'shared/init-admin'
initAdmin()

import { run } from 'common/supabase/utils'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { generateEmbeddings } from 'shared/helpers/openai-utils'

async function main() {
  const db = createSupabaseClient()
  const pg = createSupabaseDirectClient()

  const result = await run(db.from('contract_embeddings').select('contract_id'))

  const contractIds = new Set(result.data.map((row: any) => row.contract_id))
  console.log('Got', contractIds.size, 'questions with preexisting embeddings')

  const { data: contracts } = await run(
    db.from('contracts').select('id, data')
    // doesn't work if too many contracts
    // .not('id', 'in', '(' + [...contractIds].join(',') + ')')
  ).catch((err) => (console.error(err), { data: [] }))

  console.log('Got', contracts.length, 'questions to process')

  for (const contract of contracts) {
    const { id, data } = contract
    if (contractIds.has(id)) continue

    const { question } = data as { question: string }
    const embedding = await generateEmbeddings(question)
    if (!embedding || embedding.length < 1500) {
      console.log('No embeddings for', question)
      continue
    }

    console.log('Generated embeddings for', id, ':', question)

    await pg
      .none(
        'insert into contract_embeddings (contract_id, embedding) values ($1, $2) on conflict (contract_id) do nothing',
        [id, embedding]
      )
      .catch((err) => console.error(err))
  }
}

if (require.main === module) {
  main().then(() => process.exit())
}
