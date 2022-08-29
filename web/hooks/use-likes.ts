import { useEffect, useState } from 'react'
import { listenForLikes } from 'web/lib/firebase/users'
import { Like } from 'common/like'
import { Contract } from 'common/lib/contract'
import { getContractFromId } from 'web/lib/firebase/contracts'
import { filterDefined } from 'common/util/array'

export const useUserLikes = (userId: string | undefined) => {
  const [contractIds, setContractIds] = useState<Like[] | undefined>()

  useEffect(() => {
    if (userId) return listenForLikes(userId, setContractIds)
  }, [userId])

  return contractIds
}
export const useUserLikedContracts = (userId: string | undefined) => {
  const [contractIds, setContractIds] = useState<Like[] | undefined>()
  const [contracts, setContracts] = useState<Contract[] | undefined>()

  useEffect(() => {
    if (userId) return listenForLikes(userId, setContractIds)
  }, [userId])

  useEffect(() => {
    if (contractIds)
      Promise.all(
        contractIds.map(async (like) => {
          return await getContractFromId(like.contractId)
        })
      ).then((contracts) => setContracts(filterDefined(contracts)))
  }, [contractIds])

  return contracts
}
