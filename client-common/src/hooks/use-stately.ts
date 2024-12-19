import { useState } from 'react'

export const useStately = () => {
  const [size, setSize] = useState(1)

  return size
}
