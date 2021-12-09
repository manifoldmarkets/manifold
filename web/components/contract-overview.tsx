import { Contract } from '../lib/firebase/contracts'

export const ContractOverview = (props: {
  contract: Contract
}) => {
  const { contract } = props

  return (
    <div className="w-full flex">
      <div className="text-xl font-medium p-10">
        {contract.question}
      </div>
    </div>
  )
}