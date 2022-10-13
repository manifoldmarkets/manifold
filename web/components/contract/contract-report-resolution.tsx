import { Contract } from 'common/contract'
import { useUser } from 'web/hooks/use-user'
import clsx from 'clsx'
import { updateContract } from 'web/lib/firebase/contracts'
import { Tooltip } from '../tooltip'
import { ConfirmationButton } from '../confirmation-button'
import { Row } from '../layout/row'
import { FlagIcon } from '@heroicons/react/solid'
import { buildArray } from 'common/util/array'
import { useState } from 'react'

export function ContractReportResolution(props: { contract: Contract }) {
  const { contract } = props
  const user = useUser()
  const [reporting, setReporting] = useState(false)
  if (!user) {
    return <></>
  }
  const userReported = contract.flaggedByUsernames?.includes(user.id)

  const onSubmit = async () => {
    if (!user || userReported) {
      return true
    }
    setReporting(true)

    await updateContract(contract.id, {
      flaggedByUsernames: buildArray(contract.flaggedByUsernames, user.id),
    })
    setReporting(false)
    return true
  }

  const flagClass = clsx(
    'mx-2 flex flex-col items-center gap-1  w-6 h-6  rounded-md !bg-gray-100 px-1 py-2 hover:bg-gray-300',
    userReported ? '!text-red-500' : '!text-gray-500'
  )

  return (
    <Tooltip
      text={
        userReported
          ? "You've reported this market as incorrectly resolved"
          : 'Flag this market as incorrectly resolved '
      }
    >
      <ConfirmationButton
        openModalBtn={{
          label: '',
          icon: <FlagIcon className="h-5 w-5" />,
          disabled: reporting,
          className: clsx(flagClass),
        }}
        onSubmitWithSuccess={onSubmit}
        disabled={userReported}
      >
        <div>
          <Row className="items-center text-xl">
            Flag this market as incorrectly resolved
          </Row>
          <Row className="text-sm text-gray-500">
            Report that the market was not resolved according to its resolution
            criteria. If a creator's markets get flagged too often, they'll be
            marked as unreliable.
          </Row>
        </div>
      </ConfirmationButton>
    </Tooltip>
  )
}
