import { ExternalLinkIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { useState } from 'react'
import { useLinkPreview } from 'web/hooks/use-link-previews'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { MODAL_CLASS, Modal } from '../layout/modal'
import { Row } from '../layout/row'
import {
  DashboardNewsItem,
  DashboardNewsItemPlaceholder,
} from '../news/dashboard-news-item'
import { ExpandingInput } from '../widgets/expanding-input'
import { DashboardLinkItem } from 'common/dashboard'

export function DashboardAddLinkButton(props: {
  addLink: (link: DashboardLinkItem) => void
}) {
  const { addLink } = props
  const [open, setOpen] = useState(false)
  const [linkInput, setLinkInput] = useState<string>('')

  const preview = useLinkPreview(linkInput)
  const validPreview = !!preview && !preview.error
  const emptyTitle = !!preview && !!preview.title && preview.title.length === 0
  const emptyImage = !!preview && !!preview.image && preview.image.length === 0
  const emptyDescription =
    !!preview && !!preview.description && preview.description.length === 0

  return (
    <>
      <Button
        className="w-1/2"
        color="gray-outline"
        onClick={() => setOpen(true)}
      >
        <div className="flex flex-col items-center gap-1 sm:flex-row sm:gap-2">
          <ExternalLinkIcon className="h-5 w-5" />
          Add link
        </div>
      </Button>
      <Modal open={open} setOpen={setOpen}>
        <Col className={clsx(MODAL_CLASS)}>
          <ExpandingInput
            placeholder={'Paste a link to a news article or video'}
            autoFocus
            maxLength={2048}
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value || '')}
            className="w-full"
          />
          {!preview || preview.error ? (
            <DashboardNewsItemPlaceholder />
          ) : (
            <div className="relative">
              <div className="absolute top-0 bottom-0 right-0 left-0 z-40 rounded-lg bg-white opacity-10" />
              <DashboardNewsItem {...preview} />
            </div>
          )}
          <Row className="w-full justify-end gap-4">
            <Button
              onClick={() => {
                setOpen(false)
              }}
              color="gray"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                addLink({ type: 'link', url: linkInput })
                setLinkInput('')
                setOpen(false)
              }}
              color="indigo"
              disabled={
                !linkInput ||
                !validPreview ||
                (emptyTitle && emptyImage && emptyDescription)
              }
            >
              Add link
            </Button>
          </Row>
        </Col>
      </Modal>
    </>
  )
}
