import { User } from 'common/user'
import { useEffect, useState } from 'react'
import { searchUsers } from 'web/lib/supabase/users'

// use nonce to make sure only latest result gets used
let nonce = 0

export function useUserSearchResults(query: string) {
  const [results, setResults] = useState([] as User[])
  useEffect(() => {
    ++nonce
    const thisNonce = nonce
    searchUsers(query, 2).then((users) => {
      if (thisNonce === nonce) setResults(users)
    })
  }, [query])
  return results
}
