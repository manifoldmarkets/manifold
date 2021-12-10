import { useRouter } from 'next/router'
import { firebaseLogout } from '../lib/firebase/users'
import { Header } from '../components/header'
import { useUser } from '../hooks/use-user'

export default function Account() {
  const user = useUser()
  const router = useRouter()

  return (
    <div className="relative overflow-hidden h-screen bg-cover bg-gray-900">
      <Header />
      <div className="flex items-center w-full h-max px-4 py-10 bg-cover card">
        <div className="card glass lg:card-side text-neutral-content bg-gray-800 m-10 transition-all">
          <figure className="p-6">
            <img src={user?.avatarUrl} className="rounded-lg shadow-lg" />
          </figure>
          <div className="max-w-md card-body">
            <h2 className="card-title">{user?.name}</h2>
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

        {/* Lorem ipsum table. TODO: fill in user's bets and markets */}
        <h1 className="text-4xl text-neutral-content m-4">
          {user?.username}'s Bets
        </h1>
        <div className="overflow-x-auto">
          <table className="table table-compact">
            <thead>
              <tr>
                <th></th>
                <th>Name</th>
                <th>Job</th>
                <th>company</th>
                <th>location</th>
                <th>Last Login</th>
                <th>Favorite Color</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>1</th>
                <td>Cy Ganderton</td>
                <td>Quality Control Specialist</td>
                <td>Littel, Schaden and Vandervort</td>
                <td>Canada</td>
                <td>12/16/2020</td>
                <td>Blue</td>
              </tr>
              <tr>
                <th>2</th>
                <td>Hart Hagerty</td>
                <td>Desktop Support Technician</td>
                <td>Zemlak, Daniel and Leannon</td>
                <td>United States</td>
                <td>12/5/2020</td>
                <td>Purple</td>
              </tr>
              <tr>
                <th>3</th>
                <td>Brice Swyre</td>
                <td>Tax Accountant</td>
                <td>Carroll Group</td>
                <td>China</td>
                <td>8/15/2020</td>
                <td>Red</td>
              </tr>
              <tr>
                <th>4</th>
                <td>Marjy Ferencz</td>
                <td>Office Assistant I</td>
                <td>Rowe-Schoen</td>
                <td>Russia</td>
                <td>3/25/2021</td>
                <td>Crimson</td>
              </tr>
              <tr>
                <th>5</th>
                <td>Yancy Tear</td>
                <td>Community Outreach Specialist</td>
                <td>Wyman-Ledner</td>
                <td>Brazil</td>
                <td>5/22/2020</td>
                <td>Indigo</td>
              </tr>
              <tr>
                <th>6</th>
                <td>Irma Vasilik</td>
                <td>Editor</td>
                <td>Wiza, Bins and Emard</td>
                <td>Venezuela</td>
                <td>12/8/2020</td>
                <td>Purple</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
