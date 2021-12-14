import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useUser } from '../hooks/use-user'
import { Contract, deleteContract, listContracts } from '../lib/firebase/contracts'

function ContractCard(props: { contract: Contract }) {
  const { contract } = props

  // only show delete button if there's not bets
  const showDelete = contract.pot.YES === contract.seedAmounts.YES
    && contract.pot.NO === contract.seedAmounts.NO

  const [isDeleted, setIsDeleted] = useState(false) // temporary fix until we stream changes
 
  if (isDeleted)
    return <></>

  return (
    <li>
      <Link href={`/contract/${contract.id}`}>
        <a className="block hover:bg-gray-300">
          <div className="px-4 py-4 sm:px-6">
            <div className="flex items-center justify-between">
              <p className="text-base font-medium text-indigo-700 truncate">
                {contract.question}
              </p>
            </div>

            <div className="mt-2 sm:flex sm:justify-between">
              {/* <div className="sm:flex">
                <p className="mt-2 flex items-center text-sm sm:mt-0 sm:ml-6">
                  {contract.description}
                </p>
              </div> */}

              <div className="mt-2 flex items-center text-sm sm:mt-0">
                <p>
                  Created on{' '}
                  <time dateTime={`${contract.createdTime}`}>
                    {new Date(contract.createdTime).toLocaleDateString()}
                  </time>
                </p>

                {showDelete &&
                  <button
                    className="btn btn-xs btn-error btn-outline ml-2"
                    onClick={async e => {
                      e.preventDefault()
                      await deleteContract(contract.id)
                      setIsDeleted(true)
                    }}
                  >
                    Delete
                  </button>
                }
              </div>
            </div>
          </div>
        </a>
      </Link>
    </li>
  )
}

export function ContractsList(props: {}) {
  const creator = useUser()

  const [contracts, setContracts] = useState<Contract[]>([])

  useEffect(() => {
    if (creator?.id) {
      // TODO: stream changes from firestore
      listContracts(creator.id).then(setContracts)
    }
  }, [creator])

  return (
    <div className="bg-gray-200 shadow-xl overflow-hidden sm:rounded-md max-w-4xl w-full">
      <ul role="list" className="divide-y divide-gray-300">
        {contracts.map((contract) => (
          <ContractCard contract={contract} key={contract.id} />
        ))}
      </ul>
    </div>
  )
}
