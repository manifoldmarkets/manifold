import { initAdmin } from './script-init'

initAdmin()

import { getGroupForMarket } from 'shared/helpers/openai-utils'

async function main(question: string) {
  console.log('finding group for question:', question)
  const group = await getGroupForMarket(question)
  console.log(group?.name)
}

if (require.main === module) {
  main(process.argv[2]).then(() => process.exit())
}
