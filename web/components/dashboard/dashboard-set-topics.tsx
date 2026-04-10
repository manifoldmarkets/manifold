import { Group } from 'common/group'
import { TopicSelector } from '../topics/topic-selector'
import { useEffect, useState } from 'react'
import { XIcon } from '@heroicons/react/outline'
import { Row } from '../layout/row'
import { TopicTag } from '../topics/topic-tag'
import { Button } from '../buttons/button'
import { useGroupsFromIds } from 'web/hooks/use-group-supabase'
import { LoadingIndicator } from '../widgets/loading-indicator'

export function DashboardSetTopics(props: {
  topics: string[]
  setTopics: (topics: string[]) => void
  onClose: () => void
}) {
  const { topics, setTopics, onClose } = props

  const groups = useGroupsFromIds(topics)
  const [selectedGroups, setSelectedGroups] = useState<Group[]>()
  useEffect(() => {
    if (groups && !selectedGroups) {
      setSelectedGroups(groups)
    }
  }, [groups])

  if (!selectedGroups) return <LoadingIndicator />

  return (
    <>
      <Row className={'flex-wrap gap-2'}>
        {selectedGroups.map((group) => (
          <TopicTag
            location={'create page'}
            key={group.id}
            topic={group}
            className="bg-ink-100 hover:bg-ink-200"
          >
            <button
              className="text-ink-400 hover:text-ink-700 hover:bg-ink-200 ml-0.5 rounded-full p-0.5 transition-colors"
              onClick={() => {
                const cleared = selectedGroups.filter((g) => g.id !== group.id)
                setSelectedGroups(cleared)
              }}
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </TopicTag>
        ))}
      </Row>

      <TopicSelector
        addingToContract={true}
        selectedIds={selectedGroups.map((g) => g.id)}
        setSelectedGroup={(group) =>
          setSelectedGroups([...selectedGroups, group])
        }
      />

      <Row className="justify-end gap-1">
        <Button color="gray" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            setTopics(selectedGroups.map((g) => g.id))
            onClose()
          }}
        >
          Save
        </Button>
      </Row>
    </>
  )
}
