import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import clsx from 'clsx'
import { Input } from 'web/components/widgets/input'
import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import {
  createChartAnnotation,
  deleteChartAnnotation,
} from 'web/lib/firebase/api'
import { Row } from './layout/row'
import { ChartAnnotation } from 'web/hooks/use-chart-annotations'
import { UserLink } from 'web/components/widgets/user-link'
import { Avatar } from 'web/components/widgets/avatar'
import { useUser } from 'web/hooks/use-user'

export const AnnotateChartModal = (props: {
  open: boolean
  setOpen: (open: boolean) => void
  atTime: number
  contractId: string
}) => {
  const { atTime, contractId, open, setOpen } = props
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={clsx(MODAL_CLASS)}>
        <Row className={'my-2 w-full items-start justify-start'}>
          <span className={'text-primary-700 text-xl'}>
            Add a note at{' '}
            <span>
              {new Date(atTime).toLocaleDateString('en-US', {
                hour: 'numeric',
                minute: 'numeric',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </span>
        </Row>
        <Input
          type={'text'}
          className={'w-full'}
          placeholder={'What happened?'}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Row className={'w-full justify-between'}>
          <Button color={'gray-outline'} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            color={'indigo'}
            onClick={async () => {
              setLoading(true)
              await createChartAnnotation({
                contractId,
                text: note,
                eventTime: atTime,
              })
              setLoading(false)
              setOpen(false)
            }}
            loading={loading}
            disabled={loading}
          >
            Submit
          </Button>
        </Row>
      </Col>
    </Modal>
  )
}

export const ChartAnnotationModal = (props: {
  open: boolean
  setOpen: (open: boolean) => void
  chartAnnotation: ChartAnnotation
}) => {
  const user = useUser()
  const [loading, setLoading] = useState(false)
  const { chartAnnotation, open, setOpen } = props
  const {
    event_time,
    creator_username,
    creator_id,
    creator_name,
    creator_avatar_url,
  } = chartAnnotation
  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={clsx(MODAL_CLASS)}>
        <Col className={'w-full'}>
          <Row className={' justify-between'}>
            <Row className={'items-center gap-2'}>
              <Avatar
                username={creator_username}
                avatarUrl={creator_avatar_url}
                size={'md'}
              />
              <Col>
                <UserLink
                  user={{
                    username: creator_username,
                    id: creator_id,
                    name: creator_name,
                  }}
                />
                <span className={'text-ink-500 text-xs'}>
                  {new Date(event_time).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </Col>
            </Row>
            {user?.id === chartAnnotation.creator_id && (
              <Button
                color={'red-outline'}
                size={'xs'}
                loading={loading}
                disabled={loading}
                onClick={async () => {
                  setLoading(true)
                  await deleteChartAnnotation({ id: chartAnnotation.id })
                  setLoading(false)
                }}
              >
                Delete
              </Button>
            )}
          </Row>
        </Col>
        <Row className={'w-full'}>
          <span>{chartAnnotation.text}</span>
        </Row>
      </Col>
    </Modal>
  )
}
