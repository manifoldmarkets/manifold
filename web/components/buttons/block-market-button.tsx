import { usePrivateUser } from 'web/hooks/use-user'
import { updatePrivateUser } from 'web/lib/firebase/users'
import { Button } from 'web/components/buttons/button'
import { withTracking } from 'web/lib/service/analytics'
import { uniq } from 'lodash'
import { toast } from 'react-hot-toast'
import { Contract } from 'common/contract'

export function BlockMarketButton(props: { contract: Contract }) {
  const { contract } = props
  const privateUser = usePrivateUser()
  if (!privateUser || (privateUser && privateUser.id === contract.creatorId))
    return <div />
  const isBlocked = privateUser.blockedContractIds?.includes(contract.id)

  const onBlock = async () => {
    await toast.promise(
      updatePrivateUser(privateUser.id, {
        blockedContractIds: uniq([
          ...(privateUser.blockedContractIds ?? []),
          contract.id,
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
    await updatePrivateUser(privateUser.id, {
      blockedContractIds:
        privateUser.blockedContractIds?.filter((id) => id !== contract.id) ??
        [],
    })
  }

  if (isBlocked) {
    return (
      <Button
        size="xs"
        className="my-auto"
        onClick={withTracking(onUnblock, 'unblock')}
      >
        Unblock
      </Button>
    )
  }

  return (
    <Button
      size="xs"
      color="gray-outline"
      className="my-auto"
      onClick={withTracking(onBlock, 'block')}
    >
      Block
    </Button>
  )
}
