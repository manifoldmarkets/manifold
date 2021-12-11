import Link from 'next/link'
import { Contract, deleteContract } from '../lib/firebase/contracts'

function ContractCard(props: { contract: Contract }) {
  const { contract } = props
  return (
    <li>
      <Link href={`/contract/${contract.id}`}>
        <a className="block hover:bg-gray-300">
          <div className="px-4 py-4 sm:px-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-green-700 truncate">
                {contract.question}
              </p>
              <div className="ml-2 flex-shrink-0 flex">
                <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                  {contract.outcomeType}
                </p>
              </div>
            </div>
            <div className="mt-2 sm:flex sm:justify-between">
              <div className="sm:flex">
                <p className="flex items-center text-sm">{contract.id}</p>
                <p className="mt-2 flex items-center text-sm sm:mt-0 sm:ml-6">
                  {contract.description}
                </p>
              </div>
              <div className="mt-2 flex items-center text-sm sm:mt-0">
                <p>
                  Created on{' '}
                  <time dateTime={`${contract.createdTime}`}>
                    {new Date(contract.createdTime).toLocaleString()}
                  </time>
                </p>
                <button
                  className="btn btn-sm btn-error btn-outline ml-2"
                  onClick={() => {
                    deleteContract(contract.id)
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </a>
      </Link>
    </li>
  )
}

export function ContractsList(props: { contracts: Contract[] }) {
  const { contracts } = props
  return (
    <div className="bg-gray-200 shadow overflow-hidden sm:rounded-md max-w-4xl w-full">
      <ul role="list" className="divide-y divide-gray-300">
        {contracts.map((contract) => (
          <ContractCard contract={contract} key={contract.id} />
        ))}
      </ul>
    </div>
  )
}
