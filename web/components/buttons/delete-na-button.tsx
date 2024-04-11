import { type Contract } from 'common/contract'
import { useState } from 'react'
import { api, deleteMarket } from 'web/lib/firebase/api'
import { Button } from './button'

/** Button to delete (if <2 traders) or N/A */
export const DeleteNAButton = (props: { contract: Contract }) => {
  const { resolution, isResolved, uniqueBettorCount } = props.contract
  const couldDelete =
    (resolution === 'CANCEL' || !isResolved) && uniqueBettorCount < 2

  const [loadingNA, setLoadingNA] = useState(false)
  const [loadingDelete, setLoadingDelete] = useState(false)

  if (couldDelete) {
    const deleteContract = async () => {
      if (resolution !== 'CANCEL') {
        setLoadingNA(true)
        await api('market/:contractId/resolve', {
          contractId: props.contract.id,
          outcome: 'CANCEL',
        })
      }
      setLoadingDelete(true)
      setLoadingNA(false)
      await deleteMarket({ contractId: props.contract.id })
      window.location.reload()
      setLoadingDelete(false)
    }

    return (
      <Button
        size="xs"
        color="red"
        loading={loadingDelete || loadingNA}
        onClick={deleteContract}
      >
        {loadingDelete
          ? 'Deleting'
          : loadingNA
          ? 'Refunding'
          : 'Delete and refund'}
      </Button>
    )
  }

  if (!isResolved) {
    const naContract = async () => {
      setLoadingNA(true)
      await api('market/:contractId/resolve', {
        contractId: props.contract.id,
        outcome: 'CANCEL',
      })
      setLoadingNA(false)
    }

    return (
      <Button size="xs" color="yellow" onClick={naContract} loading={loadingNA}>
        Cancel trades and refund (N/A)
      </Button>
    )
  }

  return null
}
