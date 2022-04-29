**NOTE: Adapted from One Word's /functions doc. Fix any errors you see!**

# Firestore Cloud Functions

This is code that doesn't make sense on the frontend client, e.g.

- Long-running or slow operation (database)
- Tasks that need to be run every so often (syncing email list to Mailjet)
- Anything we should't trust to clients (secrets, auth)

If you want to make and test changes, you'll have to do a bit of setup...

## Installing

Adapted from https://firebase.google.com/docs/functions/get-started

0. `$ cd functions` to switch to this folder
1. `$ yarn global add firebase-tools` to install the Firebase CLI globally
2. `$ yarn` to install JS dependencies
3. `$ firebase login` to authenticate the CLI tools to Firebase
4. `$ firebase use dev` to choose the dev project

### For local development

0. `$ firebase functions:config:get > .runtimeconfig.json` to cache secrets for local dev
1. [Install](https://cloud.google.com/sdk/docs/install) gcloud CLI
2. `$ brew install java` to install java if you don't already have it
   1. `$ echo 'export PATH="/usr/local/opt/openjdk/bin:$PATH"' >> ~/.zshrc` to add java to your path
3. `$ gcloud auth login` to authenticate the CLI tools to Google Cloud
4. `$ gcloud config set project <project-id>` to choose the project (`$ gcloud projects list` to see options)
5. `$ mkdir firestore_export` to create a folder to store the exported database
6. `$ yarn db:update-local-from-remote` to pull the remote db from Firestore to local
   1. TODO: this won't work when open source, we'll have to point to the public db

## Developing locally

0. `$ firebase use dev` if you haven't already
1. `$ yarn serve` to spin up the emulators
   1. The Emulator UI is at http://localhost:4000; the functions are hosted on :5001.
      Note: You have to kill and restart emulators when you change code; no hot reload =(
2. `$ yarn dev:emulate` in `/web` to connect to emulators with the frontend
   1. Note: emulated database is cleared after every shutdown

## Firestore Commands

- `db:update-local-from-remote` - Pull the remote db from Firestore to local, also calls:
  - `db:backup-remote` - Exports the remote dev db to the backup folder on Google Cloud Storage (called on every `db:update-local-from-remote`)
  - `db:rename-remote-backup-folder` - Renames the remote backup folder (called on every `db:backup-remote` to preserve the previous db backup)
- `db:backup-local` - Save the local db changes to the disk (overwrites existing)

## Debugging

- Find local logs directly in the shell that ran `$ yarn dev`
- Find deployed logs [here](https://console.firebase.google.com/project/mantic-markets/functions/logs?search=&&severity=DEBUG)

## Deploying

0. `$ firebase use prod` to switch to prod
1. `$ yarn deploy` to push your changes live!
   (Future TODO: auto-deploy functions on Git push)

## Secrets management

Secrets are strings that shouldn't be checked into Git (eg API keys, passwords). We store these using [environment config on Firebase Functions](https://firebase.google.com/docs/functions/config-env). Some useful workflows:

- Set a secret: `$ firebase functions:config:set stripe.test_secret="THE-API-KEY"`
- Preview all secrets: `$ firebase functions:config:get`
- Cache for local dev:`$ firebase functions:config:get > .runtimeconfig.json`
