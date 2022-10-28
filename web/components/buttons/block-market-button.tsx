import { usePrivateUser } from 'web/hooks/use-user'
import { updatePrivateUser } from 'web/lib/firebase/users'
import { Button } from 'web/components/buttons/button'
import { withTracking } from 'web/lib/service/analytics'
import { uniq } from 'lodash'
import { toast } from 'react-hot-toast'

export function BlockMarketButton(props: { contractId: string }) {
  const { contractId } = props
  const user = usePrivateUser()
  if (!user) return null
  const isBlocked = user.blockedContractIds?.includes(contractId)

  const onBlock = async () => {
    await toast.promise(
      updatePrivateUser(user.id, {
        blockedContractIds: uniq([
          ...(user.blockedContractIds ?? []),
          contractId,
        ]),
      }),
      {
        loading: 'Blocking...',
        success: `You'll no longer see this market in your feed nor search.`,
        error: 'Error blocking user',
      }
    )
  }
  const onUnblock = async () => {
    await updatePrivateUser(user.id, {
      blockedContractIds:
        user.blockedContractIds?.filter((id) => id !== contractId) ?? [],
    })
  }

  if (isBlocked) {
    return (
      <Button
        size="sm"
        color="gray-outline"
        className="my-auto"
        onClick={withTracking(onUnblock, 'unblock')}
      >
        Blocked
      </Button>
    )
  }

  return (
    <Button
      size="sm"
      color="red"
      className="my-auto"
      onClick={withTracking(onBlock, 'block')}
    >
      Block
    </Button>
  )
}
