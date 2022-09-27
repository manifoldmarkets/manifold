import { CurrencyDollarIcon } from '@heroicons/react/outline'

export function BountiedContractBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3  py-0.5 text-sm font-medium text-blue-800">
      <CurrencyDollarIcon className={'h4 w-4'} /> Bounty
    </span>
  )
}
