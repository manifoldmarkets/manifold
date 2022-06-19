// This code is copied from https://firebase.google.com/docs/firestore/solutions/schedule-export
//
// To deploy after any changes:
// `yarn deploy`
//
// To manually run a backup: Click "Run Now" on the backupDb script
// https://console.cloud.google.com/cloudscheduler?project=mantic-markets
//
// Backups are here:
// https://console.cloud.google.com/storage/browser/manifold-firestore-backup
//
// To import the data into dev Firestore (from https://firebase.google.com/docs/firestore/manage-data/move-data):
// 0. Open up a cloud shell from manticmarkets@gmail.com: https://console.cloud.google.com/home/dashboard?cloudshell=true
// 1. `gcloud config set project dev-mantic-markets`
// 2. Get the backup timestamp e.g. `2022-01-25T21:19:20_6605`
// 3. `gcloud firestore import gs://manifold-firestore-backup/2022-01-25T21:19:20_6605 --async`
// 4. (Optional) `gcloud firestore operations list` to check progress

import * as functions from 'firebase-functions'
import * as firestore from '@google-cloud/firestore'
const client = new firestore.v1.FirestoreAdminClient()

const bucket = 'gs://manifold-firestore-backup'

export const backupDb = functions.pubsub
  .schedule('every 24 hours')
  .onRun((_context) => {
    const projectId = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT
    if (projectId == null) {
      throw new Error('No project ID environment variable set.')
    }
    const databaseName = client.databasePath(projectId, '(default)')

    return client
      .exportDocuments({
        name: databaseName,
        outputUriPrefix: bucket,
        // Leave collectionIds empty to export all collections
        // or set to a list of collection IDs to export,
        // collectionIds: ['users', 'posts']
        // NOTE: Subcollections are not backed up by default
        collectionIds: [
          'contracts',
          'folds',
          'private-users',
          'stripe-transactions',
          'users',
          'bets',
          'comments',
          'followers',
          'answers',
          'txns',
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
