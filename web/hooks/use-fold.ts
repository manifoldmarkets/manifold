import { useEffect, useState } from 'react'
import { Fold } from '../../common/fold'
import { listenForFold } from '../lib/firebase/folds'

export const useFold = (foldId: string) => {
  const [fold, setFold] = useState<Fold | null | undefined>()

  useEffect(() => {
    return listenForFold(foldId, setFold)
  }, [foldId])

  return fold
}
