import type { Contract, BinaryContract } from 'common/contract'

import { getOutcomeProbability, getProbability } from 'common/calculate'
import { listAllBets } from 'web/lib/firebase/bets'
import {
  getContractFromId,
  getContractFromSlug,
  listAllContracts,
} from 'web/lib/firebase/contracts'
import { listAllComments } from 'web/lib/firebase/comments'
import { getUser } from 'web/lib/firebase/users'

import { DataSource } from 'apollo-datasource'
import { InMemoryLRUCache, KeyValueCache } from 'apollo-server-caching'

/* Simple wrapper around web/lib/firebase functions */
export class FirebaseAPI extends DataSource {
  cache: KeyValueCache
  context?: any

  constructor() {
    super()
    this.cache = null as any
  }

  initialize({
    context,
    cache,
  }: { context?: any; cache?: KeyValueCache } = {}) {
    this.context = context
    this.cache = cache || new InMemoryLRUCache()
  }

  didEncounterError(error: any) {
    throw error
  }

  cacheKey(id: string | undefined, type: string) {
    return `firebaseapi-${type}-${id}`
  }

  async get<T>(
    id: string | undefined,
    type: string,
    func: () => Promise<T>,
    { ttlInSeconds = 200 }: { ttlInSeconds?: number } = {}
  ): Promise<T> {
    const cacheDoc = await this.cache.get(this.cacheKey(id, type))
    if (cacheDoc) {
      return JSON.parse(cacheDoc)
    }

    const doc = await func()

    if (ttlInSeconds) {
      this.cache.set(this.cacheKey(id, type), JSON.stringify(doc), {
        ttl: ttlInSeconds,
      })
    }

    return doc
  }

  async listAllBets(id: string) {
    return this.get(id, 'listAllBets', () => listAllBets(id))
  }

  async getContractFromSlug(id: string) {
    return this.get(id, 'getContractFromSlug', () => getContractFromSlug(id))
  }

  async getContractFromID(id: string) {
    return this.get(id, 'market', () => getContractFromId(id))
  }

  async getOutcomeProbability(contract: Contract, answerID: string) {
    return this.get(answerID, 'getOutcomeProbability', () =>
      (async () => getOutcomeProbability(contract, answerID))()
    )
  }

  async getProbability(contract: BinaryContract) {
    return this.get(contract.id, 'getProbability', () =>
      (async () => getProbability(contract))()
    )
  }

  async listAllCommentAnswers(commentId: string, contractID: string) {
    return this.get(commentId, 'listAllCommentAnswers', async () => {
      const allComments = await this.listAllComments(contractID)
      return allComments.filter((c) => c.replyToCommentId === commentId)
    })
  }

  async listAllComments(id: string) {
    return this.get(id, 'listAllComments', () => listAllComments(id))
  }

  async listAllContracts(limit = 1000, before?: string) {
    return this.get(before, 'listAllContracts', () =>
      listAllContracts(limit, before)
    )
  }

  async getUser(id: string) {
    return this.get(id, 'user', () => getUser(id))
  }
}
