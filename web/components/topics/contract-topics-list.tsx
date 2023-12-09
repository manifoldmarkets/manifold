import { Contract } from 'common/contract'
import { Group } from 'common/group'
import toast from 'react-hot-toast'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { api } from 'web/lib/firebase/api'
import { TopicSelector } from './topic-selector'
import { useGroupsWithContract } from 'web/hooks/use-group-supabase'
import { useState } from 'react'
import { XIcon } from '@heroicons/react/outline'
import { TopicTag } from 'web/components/topics/topic-tag'

export function ContractTopicsList(props: {
  contract: Contract
  canEdit: boolean
  onlyGroupIds?: string[]
  canEditGroup: (group: Group) => boolean
}) {
  const { canEditGroup, onlyGroupIds, contract, canEdit } = props
  const groups = useGroupsWithContract(contract) ?? []
  const [error, setError] = useState<string>('')

  return (
    <Col className={'gap-2'}>
      <span className={'text-primary-700 text-xl'}>Topics</span>
      <Col className="h-96 justify-between overflow-auto">
        <Col>
          {groups.length === 0 && (
            <Col className="text-ink-400">No topics yet...</Col>
          )}
          <Row className="my-2 flex-wrap gap-3">
            {groups.map((g) => {
              return (
                <TopicTag
                  location={'categories list'}
                  key={g.id}
                  topic={g}
                  className="bg-ink-100"
                >
                  {g && canEditGroup(g) && (
                    <button
                      onClick={() => {
                        toast.promise(
                          api('update-tag', {
                            groupId: g.id,
                            contractId: contract.id,
                            remove: true,
                          }).catch((e) => {
                            console.error(e.message)
                            throw e
                          }),
                          {
                            loading: `Removing question from "${g.name}"`,
                            success: `Successfully removed question from "${g.name}"!`,
                            error: `Error removing category. Try again?`,
                          }
                        )
                      }}
                    >
                      <XIcon className="hover:text-ink-700 text-ink-400 ml-1 h-4 w-4" />
                    </button>
                  )}
                </TopicTag>
              )
            })}
          </Row>
          {canEdit && (
            <Col className={'my-2 items-center justify-between p-0.5'}>
              <Row className="text-ink-400 w-full justify-start text-sm">
                Add topics
              </Row>
              <TopicSelector
                ignoreGroupIds={groups.map((g) => g.id)}
                setSelectedGroup={(group) =>
                  group &&
                  api('update-tag', {
                    groupId: group.id,
                    contractId: contract.id,
                  }).catch((e) => {
                    console.error(e.message)
                    setError(e.message)
                  })
                }
                onlyGroupIds={onlyGroupIds}
              />
              <span className={'text-error text-sm'}>{error}</span>
            </Col>
          )}
        </Col>
      </Col>
    </Col>
  )
}
