import dayjs from 'dayjs'
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
        <a className="block hover:bg-gray-200">
          <div className="px-4 py-4 sm:px-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-indigo-700">
                {contract.question}
              </p>
            </div>
            <div className="mt-2 sm:flex sm:flex-col sm:justify-between text-gray-600">
              {/* <div className="sm:flex">
                <p className="flex items-center text-sm">{contract.id}</p>
                <p className="mt-2 flex items-center text-sm">
                  {contract.description}
                </p>
              </div> */}
              <div className="mt-2 flex flex-row items-center justify-between text-sm">
                <p>
                  <time dateTime={`${contract.createdTime}`}>
                    {dayjs(contract.createdTime).format('MMM D')}
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
    <div className="bg-gray-100 shadow-xl overflow-hidden sm:rounded-md max-w-4xl w-full">
      <ul role="list" className="divide-y divide-gray-200">
        {contracts.map((contract) => (
          <ContractCard contract={contract} key={contract.id} />
        ))}
      </ul>
    </div>
  )
}
