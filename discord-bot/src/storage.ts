import * as fs from 'fs'
export const manifoldMap: { [k: string]: string } = loadManifoldMap()

export function saveManifoldMap() {
  fs.writeFileSync('keys.json', JSON.stringify(manifoldMap))
}

export function loadManifoldMap() {
  try {
    // These should be encrypted
    return JSON.parse(fs.readFileSync('keys.json', 'utf8'))
  } catch (e: any) {
    if (!e.message.includes('ENOENT')) throw e
    return {}
  }
}
