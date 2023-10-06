import { Group } from 'common/group'
import { TopicSelector } from '../topics/topic-selector'
import { useState } from 'react'
import { XIcon } from '@heroicons/react/solid'
import { Row } from '../layout/row'
import { TopicTag } from '../topics/topic-tag'
import { Button } from '../buttons/button'

export function DashboardSetTopics(props: {
  topics: string[]
  setTopics: (topics: string[]) => void
  onClose: () => void
}) {
  const { topics, setTopics, onClose } = props

  // TODO: set default based on groups already
  // useGroupFromId

  const [selectedGroups, setSelectedGroups] = useState<Group[]>([])

  return (
    <>
      <Row className={'flex-wrap gap-2'}>
        {selectedGroups.map((group) => (
          <TopicTag
            location={'create page'}
            key={group.id}
            topic={group}
            isPrivate={group.privacyStatus === 'private'}
            className="bg-ink-100"
          >
            <button
              onClick={() => {
                const cleared = selectedGroups.filter((g) => g.id !== group.id)
                setSelectedGroups(cleared)
              }}
            >
              <XIcon className="hover:text-ink-700 text-ink-400 ml-1 h-4 w-4" />
            </button>
          </TopicTag>
        ))}
      </Row>

      <TopicSelector
        ignoreGroupIds={selectedGroups.map((g) => g.id)}
        setSelectedGroup={(group) =>
          setSelectedGroups([...selectedGroups, group])
        }
      />

      <div className="mt-2 mb-3 text-center">
        Questions in the selected topics will show below your dashboard
      </div>

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
