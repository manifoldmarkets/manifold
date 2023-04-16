import { uniqBy } from 'lodash'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { useEffect, useRef, useState } from 'react'
import { buildArray } from 'common/util/array'
import { usePrivateUser } from './use-user'
import { isContractBlocked } from 'web/lib/firebase/users'
import { useEvent } from './use-event'
import { db } from 'web/lib/supabase/db'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'

const PAGE_SIZE = 20

export const useFeed = (
  user: User | null | undefined,
  key: string,
  options?: {
    binaryOnly?: boolean
    topic?: string
  }
) => {
  const { topic } = options ?? {}
  const [savedContracts, setSavedContracts] = usePersistentInMemoryState<
    Contract[] | undefined
  >(undefined, `recommended-contracts-${user?.id}-${key}`)

  const privateUser = usePrivateUser()
  const userId = user?.id

  const lastTopicRef = useRef(topic)
  const requestIdRef = useRef(0)

  const loadMore = useEvent(() => {
    if (userId) {
      requestIdRef.current++
      const requestId = requestIdRef.current
      const promise = topic
        ? db.rpc('get_recommended_contracts_embeddings_topic', {
            uid: userId,
            p_topic: topic,
            n: PAGE_SIZE,
            excluded_contract_ids: savedContracts?.map((c) => c.id) ?? [],
          })
        : db.rpc('get_recommended_contracts_embeddings', {
            uid: userId,
            n: PAGE_SIZE,
            excluded_contract_ids: savedContracts?.map((c) => c.id) ?? [],
          })

      promise.then((res) => {
        if (requestIdRef.current !== requestId) return
        if (res.data) {
          const newContracts = (res.data as any[]).map(
            (row) => row.data as Contract
          )
          if (lastTopicRef.current !== topic) {
            setSavedContracts(uniqBy(newContracts, (c) => c.id))
          } else {
            setSavedContracts(
              uniqBy(buildArray(savedContracts, newContracts), (c) => c.id)
            )
          }
          lastTopicRef.current = topic
        }
      })
    }
  })

  const [firstTopic] = useState(topic)
  const topicWasChanged = useRef(false)

  useEffect(() => {
    if (
      topic === firstTopic &&
      savedContracts?.length &&
      !topicWasChanged.current
    ) {
      return
    }
    topicWasChanged.current = true

    loadMore()
  }, [loadMore, topic])

  const filteredContracts = savedContracts?.filter(
    (c) =>
      !isContractBlocked(privateUser, c) &&
      (!options?.binaryOnly || c.outcomeType === 'BINARY')
  )

  return {
    contracts: filteredContracts,
    loadMore,
  }
}
