import { createContext, useContext, useState } from 'react'
import { User as FirebaseUser } from 'firebase/auth'

type UserType = null | FirebaseUser

type UserContextType = {
  user: UserType
  setUser: (user: UserType) => void
}

const UserContext = createContext<UserContextType | undefined>(undefined)

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserType>(null)

  const value = {
    user,
    setUser,
  }

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useUser() {
  const context = useContext(UserContext)
  if (!context) {
    throw new Error('useUser must be used within an AuthContextProvider')
  }
  return context
}
