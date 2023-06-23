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
import { CUSTOM_TOPIC_KEY } from 'web/components/topic-selector'
import { getBoosts } from 'web/lib/supabase/ads'

const PAGE_SIZE = 20

// supabase type generator adds an extra array in the return type of getBoosts, so we define our own type instead
export type BoostsType =
  | {
      ad_id: string
      question_id: string
      ad_funds: number
      ad_cost_per_view: number
      question_data: Contract
    }[]
  | null

export const useFeed = (
  user: User | null | undefined,
  key: string,
  options?: {
    binaryOnly?: boolean
    topic?: string
  }
) => {
  const { topic } = options ?? {}

  const [boosts, setBoosts] = useState<BoostsType>()
  useEffect(() => {
    if (user) getBoosts(user.id).then(setBoosts as any)
  }, [user?.id])

  const [savedContracts, setSavedContracts] = usePersistentInMemoryState<
    Contract[] | undefined
  >(undefined, `recommended-contracts-${user?.id}-${key}`)

  const privateUser = usePrivateUser()
  const userId = user?.id

  const lastTopicRef = useRef(topic)
  const requestIdRef = useRef(0)
  const getCustomEmbeddingsPromise = async (userId: string) =>
    db
      .from('user_topics')
      .select('topic_embedding')
      .eq('user_id', userId)
      .limit(1)
      .then(({ data }) => {
        return db.rpc('get_recommended_contracts_embeddings_from', {
          uid: userId,
          p_embedding: (data?.length ? data[0].topic_embedding : []) as any,
          max_dist: 0.5,
          n: PAGE_SIZE,
          excluded_contract_ids: savedContracts?.map((c) => c.id) ?? [],
        })
      })

  const fetchRecs = async (userId: string) => {
    if (topic?.includes(CUSTOM_TOPIC_KEY)) {
      return getCustomEmbeddingsPromise(userId)
    }
    if (topic) {
      return db.rpc('get_recommended_contracts_embeddings_topic', {
        uid: userId,
        p_topic: topic,
        n: PAGE_SIZE,
        excluded_contract_ids: savedContracts?.map((c) => c.id) ?? [],
      })
    }

    // Try fast query first.
    const result = await db.rpc('get_recommended_contracts_embeddings_fast', {
      uid: userId,
      n: PAGE_SIZE,
      excluded_contract_ids: savedContracts?.map((c) => c.id) ?? [],
    })
    if (result.data && result.data.length >= PAGE_SIZE) {
      return result
    }

    return await db.rpc('get_recommended_contracts_embeddings', {
      uid: userId,
      n: PAGE_SIZE,
      excluded_contract_ids: savedContracts?.map((c) => c.id) ?? [],
    })
  }

  const loadMore = useEvent(() => {
    if (userId) {
      requestIdRef.current++
      const requestId = requestIdRef.current
      fetchRecs(userId).then((res) => {
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
    boosts,
    loadMore,
  }
}
