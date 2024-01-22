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
  promises: Promise<WriteResult>[]

  constructor(
    options?: BulkWriterOptions,
    firestore: admin.firestore.Firestore = admin.firestore()
  ) {
    this.writer = firestore.bulkWriter(options)
    this.promises = []
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
    this.promises.push(p)
    return p
  }

  async create<T>(
    documentRef: DocumentReference<T>,
    data: WithFieldValue<T>
  ): Promise<WriteResult> {
    const p = this.writer.create<T>(documentRef, data)
    this.promises.push(p)
    return p
  }

  async delete(
    documentRef: DocumentReference<any>,
    precondition?: Precondition
  ): Promise<WriteResult> {
    const p = precondition
      ? this.writer.delete(documentRef, precondition)
      : this.writer.delete(documentRef)
    this.promises.push(p)
    return p
  }

  async set<T>(
    documentRef: DocumentReference<T>,
    data: WithFieldValue<T>
  ): Promise<WriteResult> {
    const p = this.writer.set<T>(documentRef, data)
    this.promises.push(p)
    return p
  }

  async close() {
    await this.writer.close()
    return await Promise.all(this.promises)
  }

  async flush() {
    await this.writer.flush()
    return await Promise.all(this.promises)
  }
}
