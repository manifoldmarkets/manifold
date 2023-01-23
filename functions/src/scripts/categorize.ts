import { initAdmin } from './script-init'

initAdmin()

import { generateEmbeddings } from '../helpers/openai-utils'
import { createSupabaseClient } from '../supabase/init'
import { run } from 'common/supabase/utils'

async function main(question: string) {
  console.log('finding group for question:', question)
  const embeddings = await generateEmbeddings(question)
  console.log(embeddings?.length, 'embeddings for 1')

  const db = createSupabaseClient()
  await run(
    db
      .from('contract_embeddings')
      .insert({ contract_id: 'sxlef', embeddings: embeddings })
  )
    .then((res: any) => console.log('inserted embeddings', res))
    .catch((e) => console.log('error', e))
}

if (require.main === module) {
  main(process.argv[2]).then(() => process.exit())
}
