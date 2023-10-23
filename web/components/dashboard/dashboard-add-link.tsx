import { useState } from 'react'
import { useLinkPreview } from 'web/hooks/use-link-previews'
import { Button } from '../buttons/button'
import { Row } from '../layout/row'
import {
  DashboardNewsItem,
  DashboardNewsItemPlaceholder,
} from '../news/dashboard-news-item'
import { ExpandingInput } from '../widgets/expanding-input'
import { DashboardLinkItem } from 'common/dashboard'

export function DashboardAddLink(props: {
  addLink: (link: DashboardLinkItem | null) => void
}) {
  const { addLink } = props
  const [linkInput, setLinkInput] = useState<string>('')

  const preview = useLinkPreview(linkInput)
  const validPreview = !!preview && !preview.error
  const emptyTitle = !!preview && !!preview.title && preview.title.length === 0
  const emptyImage = !!preview && !!preview.image && preview.image.length === 0
  const emptyDescription =
    !!preview && !!preview.description && preview.description.length === 0

  return (
    <>
      <ExpandingInput
        placeholder={'Paste a link to a news article or video'}
        autoFocus
        maxLength={2048}
        value={linkInput}
        onChange={(e) => setLinkInput(e.target.value)}
        className="w-full"
      />
      {!linkInput ? (
        <DashboardNewsItemPlaceholder />
      ) : !preview ? (
        <DashboardNewsItemPlaceholder pulse />
      ) : preview.error ? (
        <div className="text-error p-8 text-center">{preview.error}</div>
      ) : (
        <div className="relative">
          <div className="absolute inset-0 z-40 rounded-lg bg-white opacity-10" />
          <DashboardNewsItem {...preview} />
        </div>
      )}
      <Row className="w-full justify-end gap-4">
        <Button onClick={() => addLink(null)} color="gray">
          Cancel
        </Button>
        <Button
          onClick={() => {
            addLink({ type: 'link', url: linkInput })
            setLinkInput('')
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
    </>
  )
}
