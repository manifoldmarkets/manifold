// Export script from https://firebase.google.com/docs/firestore/solutions/schedule-export
// To import the data into dev Firestore: https://firebase.google.com/docs/firestore/manage-data/move-data

import * as functions from 'firebase-functions'
import * as firestore from '@google-cloud/firestore'
const client = new firestore.v1.FirestoreAdminClient()

const bucket = 'gs://manifold-firestore-backup'

export const backupDb = functions.pubsub
  .schedule('every 24 hours')
  .onRun((context) => {
    const projectId = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT
    const databaseName = client.databasePath(projectId!, '(default)')

    return client
      .exportDocuments({
        name: databaseName,
        outputUriPrefix: bucket,
        // Leave collectionIds empty to export all collections
        // or set to a list of collection IDs to export,
        // collectionIds: ['users', 'posts']
        collectionIds: [
          'contracts',
          'folds',
          'private-users',
          'stripe-transactions',
          'users',
        ],
      })
      .then((responses) => {
        const response = responses[0]
        console.log(`Operation Name: ${response['name']}`)
      })
      .catch((err) => {
        console.error(err)
        throw new Error('Export operation failed')
      })
  })
