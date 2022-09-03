// Helper functions for maintaining the relationship between fields in one set of documents and denormalized copies in
// another set of documents.

import { DocumentSnapshot, Transaction } from 'firebase-admin/firestore'
import { isEqual, zip } from 'lodash'

export type DocumentValue = {
  doc: DocumentSnapshot
  fields: string[]
  vals: unknown[]
}
export type DocumentMapping = readonly [
  DocumentSnapshot,
  readonly DocumentSnapshot[]
]
export type DocumentDiff = {
  src: DocumentValue
  dest: DocumentValue
}

type PathPair = readonly [string, string]

export function findDiffs(docs: DocumentMapping[], ...paths: PathPair[]) {
  const diffs: DocumentDiff[] = []
  const srcPaths = paths.map((p) => p[0])
  const destPaths = paths.map((p) => p[1])
  for (const [srcDoc, destDocs] of docs) {
    const srcVals = srcPaths.map((p) => srcDoc.get(p))
    for (const destDoc of destDocs) {
      const destVals = destPaths.map((p) => destDoc.get(p))
      if (!isEqual(srcVals, destVals)) {
        diffs.push({
          src: { doc: srcDoc, fields: srcPaths, vals: srcVals },
          dest: { doc: destDoc, fields: destPaths, vals: destVals },
        })
      }
    }
  }
  return diffs
}

export function describeDiff(diff: DocumentDiff) {
  function describeDocVal(x: DocumentValue): string {
    return `${x.doc.ref.path}.[${x.fields.join('|')}]: [${x.vals.join('|')}]`
  }
  return `${describeDocVal(diff.src)} -> ${describeDocVal(diff.dest)}`
}

export function applyDiff(transaction: Transaction, diff: DocumentDiff) {
  const { src, dest } = diff
  const updateSpec = Object.fromEntries(zip(dest.fields, src.vals))
  transaction.update(dest.doc.ref, updateSpec)
}
