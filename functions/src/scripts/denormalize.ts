// Helper functions for maintaining the relationship between fields in one set of documents and denormalized copies in
// another set of documents.

import { DocumentSnapshot, Transaction } from 'firebase-admin/firestore'

export type DocumentValue = {
  doc: DocumentSnapshot
  field: string
  val: unknown
}
export type DocumentCorrespondence = [DocumentSnapshot, DocumentSnapshot[]]
export type DocumentDiff = {
  src: DocumentValue
  dest: DocumentValue
}

export function findDiffs(
  docs: DocumentCorrespondence[],
  srcPath: string,
  destPath: string
) {
  const diffs: DocumentDiff[] = []
  for (const [srcDoc, destDocs] of docs) {
    const srcVal = srcDoc.get(srcPath)
    for (const destDoc of destDocs) {
      const destVal = destDoc.get(destPath)
      if (destVal !== srcVal) {
        diffs.push({
          src: { doc: srcDoc, field: srcPath, val: srcVal },
          dest: { doc: destDoc, field: destPath, val: destVal },
        })
      }
    }
  }
  return diffs
}

export function describeDiff(diff: DocumentDiff) {
  function describeDocVal(x: DocumentValue): string {
    return `${x.doc.ref.path}.${x.field}: ${x.val}`
  }
  return `${describeDocVal(diff.src)} -> ${describeDocVal(diff.dest)}`
}

export function applyDiff(transaction: Transaction, diff: DocumentDiff) {
  const { src, dest } = diff
  transaction.update(dest.doc.ref, dest.field, src.val)
}
