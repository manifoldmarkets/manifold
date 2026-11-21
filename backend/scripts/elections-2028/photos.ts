// Candidate photo lookup for answer images.
//
// backend code may not import web code, so the candidate registry is read as
// text at run time: `'Name': { party: '…', photo: '/political-candidates/x.png' …`
// entries in the web candidate data files, plus the photo credits manifest
// (`web/public/political-candidates/credits.json`, `{ file, name }` rows).
// Whether a photo is attached is decided later by checking its live URL.

import * as fs from 'fs'
import * as path from 'path'
import { canonicalCandidate, normalizeName } from './seeds'

// Registry files scanned, relative to the repository root. Missing files are
// skipped (some are being added on other branches).
export const PHOTO_REGISTRY_FILES = [
  'web/components/us-elections/ candidates/candidate-data.ts',
  'web/lib/politics/candidates.ts',
]
export const PHOTO_CREDITS_FILE = 'web/public/political-candidates/credits.json'

const ENTRY_RE =
  /['"]([^'"\n]+)['"]\s*:\s*\{[^{}]*?photo\s*:\s*['"](\/political-candidates\/[^'"]+)['"]/g

// Name -> photo path pairs from a registry file's text.
export function parsePhotoRegistry(text: string): [string, string][] {
  const out: [string, string][] = []
  for (const m of text.matchAll(ENTRY_RE)) out.push([m[1], m[2]])
  return out
}

const keyOf = (name: string) =>
  canonicalCandidate(name)?.key ?? normalizeName(name)

// Canonical candidate key -> photo path ("/political-candidates/x.png").
export function buildPhotoIndex(
  pairs: [string, string][]
): Map<string, string> {
  const index = new Map<string, string>()
  for (const [name, photo] of pairs) {
    const key = keyOf(name)
    if (key && !index.has(key)) index.set(key, photo)
  }
  return index
}

export function loadPhotoIndex(repoRoot: string): {
  index: Map<string, string>
  sources: string[]
} {
  const pairs: [string, string][] = []
  const sources: string[] = []
  for (const rel of PHOTO_REGISTRY_FILES) {
    const file = path.join(repoRoot, rel)
    if (!fs.existsSync(file)) continue
    pairs.push(...parsePhotoRegistry(fs.readFileSync(file, 'utf8')))
    sources.push(rel)
  }
  const credits = path.join(repoRoot, PHOTO_CREDITS_FILE)
  if (fs.existsSync(credits)) {
    try {
      const rows = JSON.parse(fs.readFileSync(credits, 'utf8'))
      if (Array.isArray(rows))
        for (const r of rows)
          if (r && typeof r.name === 'string' && typeof r.file === 'string')
            pairs.push([r.name, `/political-candidates/${r.file}`])
      sources.push(PHOTO_CREDITS_FILE)
    } catch {
      // A half-written credits file is ignored; the registry still works.
    }
  }
  return { index: buildPhotoIndex(pairs), sources }
}

export const photoPathFor = (index: Map<string, string>, answer: string) =>
  index.get(keyOf(answer))
