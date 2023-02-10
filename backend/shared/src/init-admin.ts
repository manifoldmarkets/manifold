import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import * as admin from 'firebase-admin'

// First, generate a private key from the Google service account management page:
// Prod: https://console.firebase.google.com/u/0/project/mantic-markets/settings/serviceaccounts/adminsdk
// Dev: https://console.firebase.google.com/u/0/project/dev-mantic-markets/settings/serviceaccounts/adminsdk
// Then set GOOGLE_APPLICATION_CREDENTIALS_PROD or GOOGLE_APPLICATION_CREDENTIALS_DEV to the path of the key.

// Then, to run a script, make sure you are pointing at the Firebase you intend to:
// $ firebase use dev (or prod)
//
// Followed by, if you have https://github.com/TypeStrong/ts-node installed (recommended):
// $ ts-node my-script.ts

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

export const getServiceAccountCredentials = (env?: string) => {
  env = env || getFirebaseActiveProject(process.cwd())
  if (env == null) {
    throw new Error(
      "Couldn't find active Firebase project; did you do `firebase use <alias>?`"
    )
  }
  const envVar = `GOOGLE_APPLICATION_CREDENTIALS_${env.toUpperCase()}`
  const keyPath = process.env[envVar]
  if (keyPath == null) {
    throw new Error(
      `Please set the ${envVar} environment variable to contain the path to your ${env} environment key file.`
    )
  }
  /* eslint-disable-next-line @typescript-eslint/no-var-requires */
  return require(keyPath)
}

export const initAdmin = (env?: string) => {
  try {
    const serviceAccount = getServiceAccountCredentials(env)
    console.log(
      `Initializing connection to ${serviceAccount.project_id} Firebase...`
    )
    return admin.initializeApp({
      projectId: serviceAccount.project_id,
      credential: admin.credential.cert(serviceAccount),
      storageBucket: `${serviceAccount.project_id}.appspot.com`,
    })
  } catch (err) {
    console.error(err)
    console.log(`Initializing connection to default Firebase...`)
    return admin.initializeApp()
  }
}
