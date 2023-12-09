import { runScript } from './run-script'
import { FieldValue } from 'firebase-admin/firestore'

if (require.main === module) {
  runScript(async ({ pg, firestore }) => {
    const contractIds = await pg.map(
      `select distinct contract_id, ts from user_events where name = 'image error on contract' order by ts desc limit 1000`,
      [],
      (r) => r.contract_id
    )

    console.log('Got', contractIds.length, 'contractIds')
    const writer = firestore.bulkWriter()

    for (const contractId of contractIds) {
      writer.update(firestore.doc(`contracts/${contractId}`), {
        coverImageUrl: FieldValue.delete(),
      })
      break
    }

    console.log('Deleting bad images...')
    await writer.close()
    console.log('Done.')
  })
}
