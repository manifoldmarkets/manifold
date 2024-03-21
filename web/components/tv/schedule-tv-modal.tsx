import dayjs from 'dayjs'
import { useState } from 'react'
import Router from 'next/router'

import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { Input } from 'web/components/widgets/input'
import { Title } from 'web/components/widgets/title'
import { useUser } from 'web/hooks/use-user'
import { deleteTV, setTV } from 'web/lib/firebase/api'
import { useAdmin } from 'web/hooks/use-admin'
import { removeUndefinedProps } from 'common/util/object'
import ShortToggle from 'web/components/widgets/short-toggle'
import { ScheduleItem } from './tv-schedule'

export function ScheduleTVModal(props: {
  open: boolean
  setOpen(open: boolean): void
  stream?: ScheduleItem
  slug?: string
}) {
  const { open, setOpen, stream } = props

  const [streamId, setStreamId] = useState(stream?.stream_id ?? '')
  const [slug, setSlug] = useState(props.slug ?? '')
  const [title, setTitle] = useState(stream?.title ?? '')
  const [isFeatured, setIsFeatured] = useState(stream?.is_featured ?? false)

  const defaultStart = stream
    ? dayjs(stream.start_time).format('YYYY-MM-DD HH:mm')
    : dayjs().format('YYYY-MM-DD HH:mm')
  const [startTime, setStartTime] = useState(defaultStart)

  const defaultEnd = stream
    ? dayjs(stream.end_time).format('YYYY-MM-DD HH:mm')
    : ''
  const [endTime, setEndTime] = useState(defaultEnd)

  const [error, setError] = useState('')

  const save = async () => {
    if (!streamId || !slug || !title || !startTime || !endTime) {
      setError('Please fill in all the required fields')
      return
    }

    // Validate the YouTube Stream ID
    if (streamId.length !== 11) {
      setError(
        'Invalid YouTube Stream ID. It should be exactly 11 characters long.'
      )
      return
    }

    const start = dayjs(startTime)
    const end = dayjs(endTime)

    if (!start.isValid() || !end.isValid()) {
      setError('Invalid start or end time format.')
      return
    }

    if (end.isBefore(start)) {
      setError('End time should be after the start time.')
      return
    }

    setOpen(false)

    await setTV(
      removeUndefinedProps({
        id: stream?.id.toString(),
        streamId: streamId,
        slug: slug,
        title,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        source: 'youtube',
        isFeatured,
      })
    )

    if (!stream) {
      Router.push(`/tv/schedule`)
    }
  }

  const deleteStream = async () => {
    if (stream) {
      setOpen(false)
      await deleteTV(stream.id.toString())
    }
  }

  const isAdmin = useAdmin()
  const user = useUser()
  const isCreatorOrAdmin = stream?.creator_id === user?.id || isAdmin

  return (
    <Modal
      open={open}
      setOpen={setOpen}
      className="bg-canvas-0 text-ink-1000 rounded-md p-8"
      size="sm"
    >
      <Col className="bg-canvas-0 gap-2.5  rounded p-4 pb-8 sm:gap-4">
        <Title className="!mb-2">
          {stream ? 'Modify' : 'Schedule'} TV event
        </Title>

        <Row className="items-center justify-between">
          <div>Event name</div>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Row>

        <Row className="items-center justify-between">
          <div>YouTube Stream ID</div>
          <Input
            value={streamId}
            onChange={(e) => setStreamId(e.target.value)}
            maxLength={11}
          />
        </Row>

        <Row className="items-center justify-between">
          <div>Market slug</div>
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
        </Row>

        <Row className="items-center justify-between gap-2">
          <div>Start</div>
          <Input
            type={'datetime-local'}
            className="dark:date-range-input-white"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setStartTime(e.target.value)}
            value={startTime}
            step={undefined}
          />
        </Row>

        <Row className="items-center justify-between">
          <div>End</div>
          <Input
            type={'datetime-local'}
            className="dark:date-range-input-white"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setEndTime(e.target.value)}
            value={endTime}
            step={undefined}
          />
        </Row>

        {isAdmin && (
          <Row className="items-center justify-between">
            <div>Featured</div>
            <ShortToggle on={isFeatured} setOn={(on) => setIsFeatured(on)} />
          </Row>
        )}

        {error && (
          <Row className="text-error mt-4">
            <div>{error}</div>
          </Row>
        )}

        <Row className="gap-4">
          <Button color="indigo" size="xl" onClick={save}>
            {stream ? 'Save' : 'Schedule'}
          </Button>
          {stream && isCreatorOrAdmin && (
            <Button
              size="xs"
              color="red-outline"
              onClick={() =>
                confirm('Are you want to delete this event?') && deleteStream()
              }
            >
              Delete event
            </Button>
          )}
        </Row>
      </Col>
    </Modal>
  )
}
