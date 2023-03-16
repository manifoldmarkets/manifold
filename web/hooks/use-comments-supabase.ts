import { Json } from 'common/supabase/schema'
import { useEffect, useState } from 'react'
import { getAllComments } from 'web/lib/supabase/comments'

export function useComments(contractId: string, limit: number) {
  const [comments, setComments] = useState<Json[]>([])

  useEffect(() => {
    if (contractId) {
      getAllComments(contractId, limit).then((result) => setComments(result))
    }
  }, [contractId])

  return comments
}
