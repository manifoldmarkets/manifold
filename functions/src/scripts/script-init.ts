import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import * as admin from 'firebase-admin'

// First, generate a private key from the Google service account management page:
// Prod: https://console.firebase.google.com/u/0/project/mantic-markets/settings/serviceaccounts/adminsdk
// Dev: https://console.firebase.google.com/u/0/project/dev-mantic-markets/settings/serviceaccounts/adminsdk
// Then set GOOGLE_ACCOUNT_CREDENTIALS_PROD or GOOGLE_ACCOUNT_CREDENTIALS_DEV to the path of the key.

// Then, to run a script, make sure you are pointing at the Firebase you intend to:
// $ firebase use dev (or prod)
//
// Followed by, if you have https://github.com/TypeStrong/ts-node installed (recommended):
// $ ts-node my-script.ts
//
// Or compile it and run the compiled version:
// $ yarn build && ../../lib/functions/scripts/src/my-script.js

const getFirebaseProjectRoot = (cwd: string) => {
  // see https://github.com/firebase/firebase-tools/blob/master/src/detectProjectRoot.ts
  let dir = cwd
  while (!fs.existsSync(path.resolve(dir, './firebase.json'))) {
    const parentDir = path.dirname(dir)
    if (parentDir === dir) {
      return null
    }
    dir = parentDir
  }
  return dir
}

const getFirebaseActiveProject = (cwd: string) => {
  // firebase uses this configstore package https://github.com/yeoman/configstore/blob/main/index.js#L9
  const projectRoot = getFirebaseProjectRoot(cwd)
  if (projectRoot == null) {
    return null
  }
  const xdgConfig =
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
  const configPath = path.join(xdgConfig, 'configstore', 'firebase-tools.json')
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    return config['activeProjects'][projectRoot]
  } catch (e) {
    return null
  }
}

export const initAdmin = (env?: string) => {
  env = env || getFirebaseActiveProject(process.cwd())
  if (env == null) {
    console.error(
      "Couldn't find active Firebase project; did you do `firebase use <alias>?`"
    )
    return
  }
  const envVar = `GOOGLE_AUTHENTICATION_CREDENTIALS_${env.toUpperCase()}`
  const keyPath = process.env[envVar]
  if (keyPath == null) {
    console.error(
      `Please set the ${envVar} environment variable to contain the path to your ${env} environment key file.`
    )
    return
  }
  console.log(`Initializing connection to ${env} Firebase...`)
  const serviceAccount = require(keyPath)
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  })
}
