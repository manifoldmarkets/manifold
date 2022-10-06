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

0. [Install](https://cloud.google.com/sdk/docs/install) gcloud CLI
1. If you don't have java (or see the error `Error: Process java -version has exited with code 1. Please make sure Java is installed and on your system PATH.`):

   1. `$ brew install java`
   2. `$ sudo ln -sfn /opt/homebrew/opt/openjdk/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk.jdk`

2. `$ gcloud auth login` to authenticate the CLI tools to Google Cloud
3. `$ gcloud config set project <project-id>` to choose the project (`$ gcloud projects list` to see options)
4. `$ mkdir firestore_export` to create a folder to store the exported database
5. `$ yarn db:update-local-from-remote` to pull the remote db from Firestore to local 0. TODO: this won't work when open source, we'll have to point to the public db

## Developing locally

0. `$ firebase use dev` if you haven't already
1. `$ yarn serve` to spin up the emulators 0. The Emulator UI is at http://localhost:4000; the functions are hosted on :5001.
   Note: You have to kill and restart emulators when you change code; no hot reload =(
2. `$ yarn dev:emulate` in `/web` to connect to emulators with the frontend 0. Note: emulated database is cleared after every shutdown

## Firestore Commands

- `db:update-local-from-remote` - Pull the remote db from Firestore to local, also calls:
  - `db:backup-remote` - Exports the remote dev db to the backup folder on Google Cloud Storage (called on every `db:update-local-from-remote`)
  - `db:rename-remote-backup-folder` - Renames the remote backup folder (called on every `db:backup-remote` to preserve the previous db backup)
- `db:backup-local` - Save the local db changes to the disk (overwrites existing)

## Debugging

- Find local logs directly in the shell that ran `$ yarn dev`
- Find deployed logs [here](https://console.firebase.google.com/project/mantic-markets/functions/logs?search=&&severity=DEBUG)

## Deploying

0. After merging, you need to manually deploy to backend:
1. `git checkout main`
1. `git pull origin main`
1. `$ firebase use prod` to switch to prod
1. `$ firebase deploy --only functions` to push your changes live!
   (Future TODO: auto-deploy functions on Git push)

## Secrets management

Secrets are strings that shouldn't be checked into Git (eg API keys, passwords). We store these using [Google Secret Manager](https://console.cloud.google.com/security/secret-manager), which provides them as environment variables to functions that require them. Some useful workflows:

- Set a secret: `$ firebase functions:secrets:set STRIPE_APIKEY`
  - Then, enter the secret in the prompt.
- Read a secret: `$ firebase functions:secrets:access STRIPE_APIKEY`
