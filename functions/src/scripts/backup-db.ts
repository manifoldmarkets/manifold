import * as firestore from '@google-cloud/firestore'
import { getServiceAccountCredentials } from './script-init'
import { backupDbCore } from '../backup-db'

async function backupDb() {
  const credentials = getServiceAccountCredentials()
  const projectId = credentials.project_id
  const client = new firestore.v1.FirestoreAdminClient({ credentials })
  const bucket = 'manifold-firestore-backup'
  const resp = await backupDbCore(client, projectId, bucket)
  console.log(`Operation: ${resp[0]['name']}`)
}

if (require.main === module) {
  backupDb().then(() => process.exit())
}
