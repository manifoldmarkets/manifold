import { convertContract } from 'common/supabase/contracts'
import { runScript } from 'run-script'
import { revalidateContractStaticProps } from 'shared/utils'

if (require.main === module) {
  runScript(async ({ pg }) => {
    const contracts = await pg.map(
      'select * from contracts order by importance_score desc limit 1000',
      [],
      convertContract
    )
    console.log(`Loaded ${contracts.length} contracts.`)
    let i = 0
    for (const contract of contracts) {
      try {
        await revalidateContractStaticProps(contract)
        i++
        console.log(`Revalidated ${i} of ${contracts.length}`)
      } catch (e) {
        console.error(`Error revalidating ${contract.id}: ${e}`)
      }
    }
  })
}
