'use client'
import { useState } from 'react'
import { PoliticsPage } from 'politics/components/politics-page'

export default function Page() {
  const [counter, setCounter] = useState(0)
  return (
    <PoliticsPage trackPageView={'home'}>
      <button
        onClick={() => {
          setCounter(counter + 1)
        }}
      >
        Increment
      </button>
      <span>Counter: {counter}</span>
    </PoliticsPage>
  )
}
