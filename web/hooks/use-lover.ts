import { useUser } from 'web/hooks/use-user'
import { useEffect, useState } from 'react'
import { Row, run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'

export const useLover = () => {
  const user = useUser()
  const [lover, setLover] = useState<Row<'lovers'>>()
  useEffect(() => {
    if (user) {
      run(db.from('lovers').select('*').eq('user_id', user.id)).then(
        ({ data }) => setLover(data[0])
      )
    }
  }, [user?.id])
  return lover
}
