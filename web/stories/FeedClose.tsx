import { LockClosedIcon } from '@heroicons/react/solid'
import { Contract } from '../../common/contract'
import { Timestamp } from '../components/contract-feed'

export function FeedClose(props: { contract: Contract }) {
  const { contract } = props

  return (
    <div className="relative flex items-start space-x-3">
      <div>
        <div className="relative px-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
            <LockClosedIcon
              className="h-5 w-5 text-gray-500"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-1 py-1.5">
        <div className="text-sm text-gray-500">
          Trading closed in this market{' '}
          <Timestamp time={contract.closeTime || 0} />
        </div>
      </div>
    </div>
  )
}
