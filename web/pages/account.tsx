import { useRouter } from 'next/router'
import { firebaseLogout } from '../lib/firebase/users'
import { Header } from '../components/header'
import { useUser } from '../hooks/use-user'
import { useState, useEffect } from 'react'
import { Contract, listContracts } from '../lib/firebase/contracts'
import { ContractsList } from '../components/contracts-list'

export default function Account() {
  const user = useUser()
  const router = useRouter()
  const [contracts, setContracts] = useState<Contract[]>([])
  useEffect(() => {
    if (user?.id) {
      listContracts(user?.id).then(setContracts)
    }
  }, [user?.id])

  return (
    <div className="relative overflow-hidden h-screen bg-cover bg-gray-900">
      <Header />
      <div className="max-w-4xl my-20 mx-auto">
        <div>
          <div className="card glass lg:card-side text-neutral-content bg-gray-800 transition-all max-w-sm mx-auto my-20">
            <figure className="p-6">
              <img src={user?.avatarUrl} className="rounded-lg shadow-lg" />
            </figure>
            <div className="max-w-md card-body">
              <h2 className="card-title font-major-mono">{user?.name}</h2>
              <p>{user?.email}</p>
              <p>${user?.balanceUsd} USD</p>
              <div className="card-actions">
                <button
                  className="btn glass rounded-full"
                  onClick={() => {
                    firebaseLogout()
                    router.push('/')
                  }}
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>

        <h1 className="text-2xl font-major-mono text-indigo-300 font-bold mt-6 mb-4">
          Your markets
        </h1>
        <ContractsList contracts={contracts} />
      </div>
    </div>
  )
}
