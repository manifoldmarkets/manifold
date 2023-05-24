import { FieldValue } from 'firebase-admin/firestore'
import { runScript } from './run-script'

if (require.main === module) {
  runScript(async ({ firestore }) => {
    const writer = firestore.bulkWriter()
    const refs = await firestore.collection('contracts').listDocuments()
    console.log(`Updating ${refs.length} contracts.`)
    for (const ref of refs) {
      writer.update(ref, { uniqueBettorIds: FieldValue.delete() })
    }
    await writer.close()
  })
}
