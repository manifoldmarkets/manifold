import { User } from 'common/user'
import { useEffect, useRef, useState } from 'react'
import { searchUsers } from 'web/lib/supabase/users'

export function useUserSearchResults(query: string, limit: number) {
  const [results, setResults] = useState([] as User[])
  // use nonce to make sure only latest result gets used
  const nonce = useRef(0)

  useEffect(() => {
    ++nonce.current
    const thisNonce = nonce.current
    searchUsers(query, limit).then((users) => {
      if (thisNonce === nonce.current) setResults(users)
    })
  }, [query, limit])
  return results
}
