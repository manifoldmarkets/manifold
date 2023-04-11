import { debounce } from 'lodash'
import { useRef, useState } from 'react'
import { useEvent } from 'web/hooks/use-event'
import { saveTopic } from 'web/lib/firebase/api'
import { track } from 'web/lib/service/analytics'
import { Row } from '../layout/row'
import { Input } from '../widgets/input'
import { LoadingIndicator } from '../widgets/loading-indicator'

export function TopicSearch(props: {
  onSetTopic: (topic: string) => void
  initialTopic: string
}) {
  const { onSetTopic, initialTopic } = props
  const [query, setQuery] = useState(initialTopic)
  const [isLoading, setIsLoading] = useState(false)

  const requestIdRef = useRef(0)
  const onSearch = useEvent((query: string) => {
    setQuery(query)
    requestIdRef.current++
    const requestId = requestIdRef.current
    setIsLoading(true)
    save(query, () => {
      if (requestId === requestIdRef.current) {
        onSetTopic(query)
        setTimeout(() => {
          if (requestId === requestIdRef.current) {
            setIsLoading(false)
          }
        }, 1000)
      }
    })
  })

  return (
    <Row className="gap-4">
      <Input
        className="flex-1"
        placeholder="Search any topic"
        value={query}
        onChange={(e) => onSearch(e.target.value)}
      />
      {isLoading && <LoadingIndicator />}
    </Row>
  )
}

const save = debounce((query: string, onComplete: () => void) => {
  track('search topic', { topic: query })
  saveTopic({ topic: query }).then(onComplete)
}, 200)
