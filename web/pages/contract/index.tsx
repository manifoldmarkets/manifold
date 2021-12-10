import { FieldValue, serverTimestamp } from '@firebase/firestore'
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
    <li key={contract.id}>
      <a href="#" className="block hover:bg-gray-600">
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
              <p className="flex items-center text-sm">
                {/* <UsersIcon
                  className="flex-shrink-0 mr-1.5 h-5 w-5 text-gray-400"
                  aria-hidden="true"
                /> */}
                {contract.id}
              </p>
              <p className="mt-2 flex items-center text-sm sm:mt-0 sm:ml-6">
                {/* <LocationMarkerIcon
                  className="flex-shrink-0 mr-1.5 h-5 w-5 text-gray-400"
                  aria-hidden="true"
                /> */}
                {contract.description}
              </p>
            </div>
            <div className="mt-2 flex items-center text-sm sm:mt-0">
              {/* <CalendarIcon
                className="flex-shrink-0 mr-1.5 h-5 w-5 text-gray-400"
                aria-hidden="true"
              /> */}
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
    </li>
  )
}

// Allow user to create a new contract
export default function NewContract() {
  const creator = useUser()
  const [contract, setContract] = useState<Contract>({
    // creatorId: creator?.id || '',
    // TODO: Set create time to Firestore timestamp
    createdTime: Date.now(),
    lastUpdatedTime: Date.now(),
  } as Contract)

  const [contracts, setContracts] = useState<Contract[]>([])
  useEffect(() => {
    if (creator?.id) {
      setContract({ ...contract, creatorId: creator.id })
      listContracts(creator?.id).then(setContracts)
    }
  }, [creator?.id])

  async function saveContract() {
    await pushContract(contract)
    // Update local contract list
    setContracts([...contracts, { ...contract }])
  }

  function saveField(field: keyof Contract) {
    return (changeEvent: React.ChangeEvent<any>) =>
      setContract({ ...contract, [field]: changeEvent.target.value })
  }

  const descriptionPlaceholder = `e.g. This market will resolve to “Yes” if, by June 2, 2021, 11:59:59 PM ET, Paxlovid (also known under PF-07321332)...`

  return (
    <div className="relative overflow-hidden h-screen bg-cover bg-gray-900">
      <Header />
      <div className="grid place-items-center py-20">
        <div className="max-w-4xl w-full bg-gray-500 rounded-lg shadow-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl text-indigo-300 font-bold">
              Create a new contract
            </h1>
          </div>

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
                  <input type="number" placeholder="100" className="input" />
                </div>
              </div>

              <div className="sm:col-span-3">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">No Seed</span>
                  </label>
                  <input type="number" placeholder="100" className="input" />
                </div>
              </div>
            </div>

            {/* TODO: Show a preview of the created market here? */}

            <div className="flex justify-end pt-3">
              <button
                type="submit"
                className="btn btn-primary"
                onClick={(e) => {
                  e.preventDefault()
                  saveContract()
                }}
              >
                Save
              </button>
            </div>
          </form>
        </div>

        {/* Show a separate card for each contract */}
        <div className="bg-gray-500 shadow overflow-hidden sm:rounded-md mt-8 max-w-4xl w-full">
          <ul role="list" className="divide-y divide-gray-200">
            {contracts.map((contract) => (
              <ContractCard contract={contract} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
