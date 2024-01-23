import { firestore } from 'firebase-admin'
import DocumentReference = firestore.DocumentReference
import UpdateData = firestore.UpdateData
import Precondition = firestore.Precondition
import BulkWriterOptions = firestore.BulkWriterOptions
import BulkWriter = firestore.BulkWriter
import * as admin from 'firebase-admin'
import WriteResult = firestore.WriteResult
import WithFieldValue = firestore.WithFieldValue

export class SafeBulkWriter {
  writer: BulkWriter
  errors: Error[]
  record = async (p: Promise<WriteResult>) => {
    return p.catch((e) => {
      this.errors.push(e)
      return e
    })
  }

  constructor(
    options?: BulkWriterOptions,
    firestore: admin.firestore.Firestore = admin.firestore()
  ) {
    this.writer = firestore.bulkWriter(options)
    this.errors = []
  }

  async update<T>(
    documentRef: DocumentReference<T>,
    data: UpdateData<T>,
    precondition?: Precondition
  ): Promise<WriteResult> {
    // Must use this check, otherwise writer will throw an error
    const p = precondition
      ? this.writer.update<T>(documentRef, data, precondition)
      : this.writer.update<T>(documentRef, data)
    return this.record(p)
  }

  async create<T>(
    documentRef: DocumentReference<T>,
    data: WithFieldValue<T>
  ): Promise<WriteResult> {
    const p = this.writer.create<T>(documentRef, data)
    return this.record(p)
  }

  async delete(
    documentRef: DocumentReference<any>,
    precondition?: Precondition
  ): Promise<WriteResult> {
    const p = precondition
      ? this.writer.delete(documentRef, precondition)
      : this.writer.delete(documentRef)
    return this.record(p)
  }

  async set<T>(
    documentRef: DocumentReference<T>,
    data: WithFieldValue<T>
  ): Promise<WriteResult> {
    const p = this.writer.set<T>(documentRef, data)
    return this.record(p)
  }

  async close() {
    await this.writer.close()
    if (this.errors.length > 0) throw this.errors[0]
  }

  async flush() {
    await this.writer.flush()
    if (this.errors.length > 0) throw this.errors[0]
  }
}
