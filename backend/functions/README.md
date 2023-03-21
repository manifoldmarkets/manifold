# Firestore Cloud Functions

This is code that doesn't make sense on the frontend client, e.g.

- Long-running or slow operation (database)
- Tasks that need to be run every so often (syncing email list to Mailjet)
- Anything we should't trust to clients (secrets, auth)

If you want to make and test changes, you'll have to do a bit of setup...

## Installing

Adapted from https://firebase.google.com/docs/functions/get-started

0. `$ cd backend/functions` to switch to this folder
1. `$ yarn global add firebase-tools` to install the Firebase CLI globally
2. `$ yarn` to install JS dependencies
3. `$ firebase login` to authenticate the CLI tools to Firebase
4. `$ firebase use dev` to choose the dev project

## Installing For local development

0. [Install](https://cloud.google.com/sdk/docs/install) gcloud CLI
1. If you don't have java (or see the error `Error: Process java -version has exited with code 1. Please make sure Java is installed and on your system PATH.`):

   1. `$ brew install java`
   2. `$ sudo ln -sfn /opt/homebrew/opt/openjdk/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk.jdk`

2. `$ gcloud auth login` to authenticate the CLI tools to Google Cloud
3. `$ gcloud config set project <project-id>` to choose the project (`$ gcloud projects list` to see options)
4. `$ mkdir firestore_export` to create a folder to store the exported database.
5. `$ yarn db:update-local-from-remote` to pull the remote db from Firestore to local
   - OR download db exports from [google drive](https://drive.google.com/drive/folders/1C_EuERO9KlQEH9hg9aCMjcKYvL39kTrU?usp=share_link). Then change the name to `firestore_export` and put it in `backend/` directory

### Setting up Authentication

Generate new private keys from the Google service account management page:

- Dev: https://console.firebase.google.com/u/0/project/dev-mantic-markets/settings/serviceaccounts/adminsdk

- Prod: https://console.firebase.google.com/u/0/project/mantic-markets/settings/serviceaccounts/adminsdk

Set environment variable `GOOGLE_APPLICATION_CREDENTIALS_PROD` or `GOOGLE_APPLICATION_CREDENTIALS_DEV` in your shell to the path of the key file.

e.g. in `~/.zshrc` or `~/.bashrc`

```
export GOOGLE_APPLICATION_CREDENTIALS_DEV=~/dev-mantic-market.json
```

## Developing locally

0. `$ ./dev.sh localdb` (in the root, not here) to start the local emulator and front end. Exiting after ctrl+c takes a few seconds, give it time! Don't run ctrl+c multiple times or you'll have to kill processes manually.

   1. Or `$ ./dev.sh dev` to start the local emulator for the functions, but still using the dev db
   2. Or `$ yarn serve` in this dir to start the functions only

1. If you change db trigger code, you have to start (doesn't have to complete) the deploy of it to dev to cause a hard emulator code refresh `$ firebase deploy --only functions:dbTriggerNameHere`
   - There's surely a better way to cause/react to a db trigger update but just adding this here for now as it works
2. If you want to test a scheduled function replace your function in `test-scheduled-function.ts` and send a GET to `http://localhost:8088/testscheduledfunction` (Best user experience is via [Postman](https://www.postman.com/downloads/)!)
3. If your emulators won't start, try running `export JAVA_TOOL_OPTIONS="-Xmx4g"` to give them more memory (4gb in this example)

- It's best to use a browser (both on localhost:3000 and localhost:4000) with **totally clean** history or history **only** from the emulator to avoid buggy mixing of cached data.
- By default, changes made to the local db are not saved. If you start the emulators and add the `--export-on-exit` flag, the emulators will save changes to `./firestore_export` on exit.

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

To access a secret from a cloud function, you'll need to:

1. Expose it to the function, by editing the function in Google Cloud Console (like [here's onCreateContract](https://console.cloud.google.com/functions/edit/us-central1/onCreateContract?env=gen1&authuser=0&hl=en&project=mantic-markets)).
   - Go to "Security and image repo"->Secrets->Add->choose exposed as env variable.
2. Expose it programatically to the function by adding a runWith param
   - Example: `.runWith({ secrets: ['MAILGUN_KEY', 'DREAM_KEY'] }`)
