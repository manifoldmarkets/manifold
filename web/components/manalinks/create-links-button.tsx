import clsx from 'clsx'
import { useState } from 'react'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Title } from '../title'
import { User } from 'common/user'
import { ManalinkCard, ManalinkInfo } from 'web/components/manalink-card'
import { createManalink } from 'web/lib/firebase/manalinks'
import { Modal } from 'web/components/layout/modal'
import Textarea from 'react-expanding-textarea'
import dayjs from 'dayjs'
import { Button } from '../button'
import { getManalinkUrl } from 'web/pages/links'
import { DuplicateIcon } from '@heroicons/react/outline'
import { QRCode } from '../qr-code'
import { Input } from '../input'

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
  const [copyPressed, setCopyPressed] = useState(false)
  setTimeout(() => setCopyPressed(false), 300)
  const defaultExpire = 'week'
  const [expiresIn, setExpiresIn] = useState(defaultExpire)

  const defaultMessage = 'from ' + user.name

  const [newManalink, setNewManalink] = useState<ManalinkInfo>({
    expiresTime: dayjs().add(1, defaultExpire).valueOf(),
    amount: 100,
    maxUses: 1,
    uses: 0,
    message: defaultMessage,
  })

  const EXPIRE_OPTIONS = {
    day: '1 Day',
    week: '1 Week',
    month: '1 Month',
    never: 'Never',
  }

  const expireOptions = Object.entries(EXPIRE_OPTIONS).map(([key, value]) => {
    return <option value={key}>{value}</option>
  })

  function setExpireTime(timeDelta: string) {
    const expiresTime =
      timeDelta === 'never' ? null : dayjs().add(1, timeDelta).valueOf()
    setNewManalink((m) => {
      return {
        ...m,
        expiresTime,
      }
    })
  }

  const url = getManalinkUrl(highlightedSlug)

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
              <div className="relative">
                <span className="absolute mx-3 mt-3.5 text-sm text-gray-400">
                  M$
                </span>
                <Input
                  className="w-full pl-10"
                  type="number"
                  min="1"
                  value={newManalink.amount}
                  onChange={(e) =>
                    setNewManalink((m) => {
                      return { ...m, amount: parseInt(e.target.value) }
                    })
                  }
                />
              </div>
            </div>
            <div className="flex flex-col gap-2 md:flex-row">
              <div className="form-control w-full md:w-1/2">
                <label className="label">Uses</label>
                <Input
                  type="number"
                  min="1"
                  value={newManalink.maxUses ?? ''}
                  onChange={(e) =>
                    setNewManalink((m) => {
                      return { ...m, maxUses: parseInt(e.target.value) }
                    })
                  }
                />
              </div>
              <div className="form-control w-full md:w-1/2">
                <label className="label">Expires in</label>
                <select
                  className="!select !select-bordered"
                  value={expiresIn}
                  defaultValue={defaultExpire}
                  onChange={(e) => {
                    setExpiresIn(e.target.value)
                    setExpireTime(e.target.value)
                  }}
                >
                  {expireOptions}
                </select>
              </div>
            </div>
            <div className="form-control w-full">
              <label className="label">Message</label>
              <Textarea
                placeholder={defaultMessage}
                maxLength={200}
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
          <ManalinkCard className="my-4" info={newManalink} preview />
          <Row
            className={clsx(
              'rounded border bg-gray-50 py-2 px-3 text-sm text-gray-500 transition-colors duration-700',
              copyPressed ? 'bg-indigo-50 text-indigo-500 transition-none' : ''
            )}
          >
            <div className="w-full select-text truncate">{url}</div>
            <DuplicateIcon
              onClick={() => {
                navigator.clipboard.writeText(url)
                setCopyPressed(true)
              }}
              className="my-auto ml-2 h-5 w-5 cursor-pointer transition hover:opacity-50"
            />
          </Row>

          <QRCode url={url} className="self-center" />
        </>
      )}
    </>
  )
}
