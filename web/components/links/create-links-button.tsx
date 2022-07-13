import clsx from 'clsx'
import { useState } from 'react'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Title } from '../title'
import { User } from 'common/user'
import { ManalinkCardPreview, ManalinkInfo } from 'web/components/manalink-card'
import { createManalink } from 'web/lib/firebase/manalinks'
import { Modal } from 'web/components/layout/modal'
import Textarea from 'react-expanding-textarea'
import dayjs from 'dayjs'
import Button from '../button'
import getManalinkUrl from 'web/pages/get-manalink-url'
import { DuplicateIcon } from '@heroicons/react/outline'

export function CreateLinksButton(props: {
  user: User

  highlightedSlug: string
  setHighlightedSlug: (slug: string) => void
}) {
  const { user, highlightedSlug, setHighlightedSlug } = props

  const [open, setOpen] = useState(false)

  return (
    <>
      <Modal open={open} setOpen={(newOpen) => setOpen(newOpen)}>
        <Col className="gap-4 rounded-md bg-white px-8 py-6">
          <CreateManalinkForm
            highlightedSlug={highlightedSlug}
            user={user}
            onCreate={async (newManalink) => {
              const slug = await createManalink({
                fromId: user.id,
                amount: newManalink.amount,
                expiresTime: newManalink.expiresTime,
                maxUses: newManalink.maxUses,
                message: newManalink.message,
              })
              setHighlightedSlug(slug || '')
            }}
          />
        </Col>
      </Modal>

      <Button
        color={'indigo'}
        onClick={() => setOpen(true)}
        className={clsx('whitespace-nowrap')}
      >
        Create a Manalink
      </Button>
    </>
  )
}

function CreateManalinkForm(props: {
  highlightedSlug: string
  user: User
  onCreate: (m: ManalinkInfo) => Promise<void>
}) {
  const { user, onCreate, highlightedSlug } = props
  const [isCreating, setIsCreating] = useState(false)
  const [finishedCreating, setFinishedCreating] = useState(false)
  const [newManalink, setNewManalink] = useState<ManalinkInfo>({
    expiresTime: null,
    amount: 100,
    maxUses: 1,
    uses: 0,
    message: '',
  })
  return (
    <>
      {!finishedCreating && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setIsCreating(true)
            onCreate(newManalink).finally(() => setIsCreating(false))
            setFinishedCreating(true)
          }}
        >
          <Title className="!my-0" text="Create a Manalink" />
          <div className="flex flex-col flex-wrap gap-x-5 gap-y-2">
            <div className="form-control flex-auto">
              <label className="label">Amount</label>
              <input
                className="input input-bordered"
                type="number"
                value={newManalink.amount}
                onChange={(e) =>
                  setNewManalink((m) => {
                    return { ...m, amount: parseInt(e.target.value) }
                  })
                }
              ></input>
            </div>
            <div className="flex flex-col gap-2 md:flex-row">
              <div className="form-control">
                <label className="label">Uses</label>
                <input
                  className="input input-bordered w-full"
                  type="number"
                  value={newManalink.maxUses ?? ''}
                  onChange={(e) =>
                    setNewManalink((m) => {
                      return { ...m, maxUses: parseInt(e.target.value) }
                    })
                  }
                ></input>
              </div>
              <div className="form-control">
                <label className="label">Expires in</label>
                <input
                  value={
                    newManalink.expiresTime != null
                      ? dayjs(newManalink.expiresTime).format(
                          'YYYY-MM-DDTHH:mm'
                        )
                      : ''
                  }
                  className="input input-bordered"
                  type="datetime-local"
                  onChange={(e) => {
                    setNewManalink((m) => {
                      return {
                        ...m,
                        expiresTime: e.target.value
                          ? dayjs(e.target.value, 'YYYY-MM-DDTHH:mm').valueOf()
                          : null,
                      }
                    })
                  }}
                ></input>
              </div>
            </div>
            <div className="form-control w-full">
              <label className="label">Message</label>
              <Textarea
                placeholder={`From ${user.name}`}
                className="input input-bordered resize-none"
                autoFocus
                value={newManalink.message}
                rows="3"
                onChange={(e) =>
                  setNewManalink((m) => {
                    return { ...m, message: e.target.value }
                  })
                }
              />
            </div>
          </div>
          <Button
            type="submit"
            color={'indigo'}
            className={clsx(
              'mt-8 whitespace-nowrap drop-shadow-md',
              isCreating ? 'disabled' : ''
            )}
          >
            Create
          </Button>
        </form>
      )}
      {finishedCreating && (
        <>
          <Title className="!my-0" text="Manalink Created!" />
          <ManalinkCardPreview
            className="my-4 mx-8"
            defaultMessage={`From ${user.name}`}
            info={newManalink}
          />
          <Row className="rounded border bg-gray-50 py-2 px-3 text-sm text-gray-500">
            <div className="w-full select-text truncate">
              {getManalinkUrl(highlightedSlug)}
            </div>
            <DuplicateIcon
              onClick={() => {
                navigator.clipboard.writeText(getManalinkUrl(highlightedSlug))
              }}
              className="my-auto ml-2 h-5 w-5 cursor-copy"
            />
          </Row>
        </>
      )}
    </>
  )
}
