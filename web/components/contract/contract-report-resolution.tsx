import { Contract } from 'common/contract'
import { useUser } from 'web/hooks/use-user'
import clsx from 'clsx'
import { updateContract } from 'web/lib/firebase/contracts'
import { Tooltip } from '../tooltip'
import { ConfirmationButton } from '../confirmation-button'
import { Row } from '../layout/row'
import { FlagIcon } from '@heroicons/react/solid'
import { buildArray } from 'common/lib/util/array'

export function ContractReportResolution(props: { contract: Contract }) {
  const { contract } = props
  const user = useUser()
  if (!user) {
    return <></>
  }
  const userReported = contract.flaggedByUsernames?.includes(user.id)

  const onSubmit = async () => {
    if (!user) {
      return true
    }

    await updateContract(contract.id, {
      flaggedByUsernames: buildArray(contract.flaggedByUsernames, user.id),
    })
    return true
  }

  const flagClass = clsx(
    'mx-2 flex flex-col items-center gap-1  w-6 h-6 text-gray-500 rounded-md bg-gray-100 px-2 py-1 hover:bg-gray-300',
    userReported && 'text-red-500'
  )

  return (
    <Tooltip text="Flag this market as incorrectly resolved">
      <ConfirmationButton
        openModalBtn={{
          label: '',
          icon: <FlagIcon className="h-5 w-5" />,
          className: flagClass,
        }}
        cancelBtn={{
          label: 'Cancel',
          className: 'border-none btn-sm btn-ghost self-center',
        }}
        submitBtn={{
          label: 'Submit',
          className: 'btn-secondary',
        }}
        onSubmitWithSuccess={onSubmit}
      >
        <Row className="items-center text-xl">
          Flag this market as incorrectly resolved
        </Row>
      </ConfirmationButton>
    </Tooltip>
  )
}
