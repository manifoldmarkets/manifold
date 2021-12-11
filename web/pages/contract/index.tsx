import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Header } from '../../components/header'
import { useUser } from '../../hooks/use-user'
import {
  Contract,
  deleteContract,
  listContracts,
  setContract as pushContract,
} from '../../lib/firebase/contracts'

function ContractCard(props: { contract: Contract }) {
  const { contract } = props
  return (
    <li>
      <Link href={`/contract/${contract.id}`}>
        <a className="block hover:bg-gray-600">
          <div className="px-4 py-4 sm:px-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-indigo-300 truncate">
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
                  className="btn btn-sm btn-error ml-2"
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

export function ContractList(props: { contracts: Contract[] }) {
  const { contracts } = props
  return (
    <div className="bg-gray-500 shadow overflow-hidden sm:rounded-md max-w-4xl w-full">
      <ul role="list" className="divide-y divide-gray-200">
        {contracts.map((contract) => (
          <ContractCard contract={contract} key={contract.id} />
        ))}
      </ul>
    </div>
  )
}

// Allow user to create a new contract
// TODO: Extract to a reusable UI, for listing contracts too?
export default function NewContract() {
  const creator = useUser()
  const [contract, setContract] = useState<Contract>({
    id: '',
    creatorId: '',
    question: '',
    description: '',
    seedAmounts: { YES: 100, NO: 100 },
    pot: { YES: 100, NO: 100 },

    // TODO: Set create time to Firestore timestamp
    createdTime: Date.now(),
    lastUpdatedTime: Date.now(),
  } as Contract)

  const [contracts, setContracts] = useState<Contract[]>([])
  useEffect(() => {
    if (creator?.id) {
      setContract((contract) => ({
        ...contract,
        creatorId: creator.id,
        creatorName: creator.name,
      }))
      listContracts(creator?.id).then(setContracts)
    }
  }, [creator?.id])

  async function saveContract() {
    await pushContract(contract)
    // Update local contract list
    setContracts([{ ...contract }, ...contracts])
  }

  function saveField(field: keyof Contract) {
    return (changeEvent: React.ChangeEvent<any>) =>
      setContract({ ...contract, [field]: changeEvent.target.value })
  }

  const descriptionPlaceholder = `e.g. This market will resolve to “Yes” if, by June 2, 2021, 11:59:59 PM ET, Paxlovid (also known under PF-07321332)...`

  return (
    <div>
      <Header />
      <div className="max-w-4xl my-20 lg:mx-auto mx-4">
        <h1 className="text-2xl font-major-mono text-indigo-300 font-bold mt-6 mb-4">
          Create a new prediction market
        </h1>
        <div className="w-full bg-gray-500 rounded-lg shadow-xl p-6">
          {/* Create a Tailwind form that takes in all the fields needed for a new contract */}
          {/* When the form is submitted, create a new contract in the database */}
          <form>
            <div className="form-control">
              <label className="label">
                <span className="label-text">Contract ID</span>
              </label>
              <input
                type="text"
                placeholder="e.g. COVID-123"
                className="input"
                value={contract.id}
                onChange={saveField('id')}
              />
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">Question</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Will the FDA approve Paxlovid before Jun 2nd, 2022?"
                className="input"
                value={contract.question}
                onChange={saveField('question')}
              />
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">Description</span>
              </label>
              <textarea
                className="textarea h-24 textarea-bordered"
                placeholder={descriptionPlaceholder}
                value={contract.description}
                onChange={saveField('description')}
              ></textarea>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Yes Seed</span>
                  </label>
                  <input
                    type="number"
                    placeholder="100"
                    className="input"
                    value={contract.seedAmounts.YES}
                    onChange={(e) => {
                      setContract({
                        ...contract,
                        seedAmounts: {
                          ...contract.seedAmounts,
                          YES: parseInt(e.target.value),
                        },
                        pot: {
                          ...contract.pot,
                          YES: parseInt(e.target.value),
                        },
                      })
                    }}
                  />
                </div>
              </div>

              <div className="sm:col-span-3">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">No Seed</span>
                  </label>
                  <input
                    type="number"
                    placeholder="100"
                    className="input"
                    value={contract.seedAmounts.NO}
                    onChange={(e) => {
                      setContract({
                        ...contract,
                        seedAmounts: {
                          ...contract.seedAmounts,
                          NO: parseInt(e.target.value),
                        },
                        pot: {
                          ...contract.pot,
                          NO: parseInt(e.target.value),
                        },
                      })
                    }}
                  />
                </div>
              </div>
            </div>

            {/* TODO: Show a preview of the created market here? */}

            <div className="flex justify-end mt-6">
              <button
                type="submit"
                className="btn btn-primary"
                onClick={(e) => {
                  e.preventDefault()
                  saveContract()
                }}
              >
                Create market
              </button>
            </div>
          </form>
        </div>

        {/* Show a separate card for each contract */}
        <h1 className="text-2xl  font-major-mono text-indigo-300 font-bold mt-6 mb-4">
          Your markets
        </h1>

        <ContractList contracts={contracts} />
      </div>
    </div>
  )
}
