import clsx from 'clsx'
import { filterDefined } from 'common/util/array'
import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { MODAL_CLASS, Modal } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { BuyAmountInput } from 'web/components/widgets/amount-input'
import { Avatar } from 'web/components/widgets/avatar'
import { Input } from 'web/components/widgets/input'
import { UserLink } from 'web/components/widgets/user-link'
import { useUser } from 'web/hooks/use-user'
import { createMatch } from 'web/lib/firebase/love/api'
import { firebaseLogin } from 'web/lib/firebase/users'
import { Lover } from 'common/love/lover'
import { CommentInputTextArea } from 'web/components/comments/comment-input'
import { Editor } from '@tiptap/react'
import { useTextEditor } from 'web/components/widgets/editor'
import { MAX_COMMENT_LENGTH } from 'common/comment'

export const AddAMatchButton = (props: {
  lover: Lover
  potentialLovers: Lover[]
  className?: string
}) => {
  const { lover, potentialLovers, className } = props

  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [betAmount, setBetAmount] = useState<number | undefined>(20)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const currentUser = useUser()
  const key = `comment ${potentialLovers.map((l) => l.id).join(',')}`

  const editor = useTextEditor({
    key,
    size: 'sm',
    max: MAX_COMMENT_LENGTH,
    placeholder: 'Write your introduction...',
  })
  const submit = async () => {
    if (!selectedMatchId || !betAmount) return

    setIsSubmitting(true)
    const result = await createMatch({
      userId1: lover.user_id,
      userId2: selectedMatchId,
      betAmount,
      introduction: editor?.getJSON(),
    }).finally(() => {
      setIsSubmitting(false)
    })
    setDialogOpen(false)

    console.log('result', result)

    if (result.success) {
      window.location.reload()
    }
  }
  if (!lover.looking_for_matches)
    return (
      <div className="text-ink-500 text-sm">
        Not looking for more matches right now
      </div>
    )

  if (!currentUser) {
    return (
      <Button color={'indigo'} onClick={firebaseLogin}>
        Add a match
      </Button>
    )
  }
  return (
    <>
      <Button
        className={clsx(className)}
        color="indigo"
        onClick={() => setDialogOpen(true)}
        disabled={isSubmitting}
        loading={isSubmitting}
      >
        Add a match
      </Button>
      {dialogOpen && (
        <AddMatchDialog
          editor={editor}
          lover={lover}
          potentialLovers={potentialLovers}
          selectedMatchId={selectedMatchId}
          setSelectedMatchId={setSelectedMatchId}
          betAmount={betAmount}
          setBetAmount={setBetAmount}
          isSubmitting={isSubmitting}
          setOpen={setDialogOpen}
          submit={submit}
        />
      )}
    </>
  )
}

const AddMatchDialog = (props: {
  lover: Lover
  potentialLovers: Lover[]
  selectedMatchId: string | null
  setSelectedMatchId: (matchId: string | null) => void
  betAmount: number | undefined
  setBetAmount: (betAmount: number | undefined) => void
  isSubmitting: boolean
  setOpen: (open: boolean) => void
  submit: () => void
  editor: Editor | null
}) => {
  const {
    lover,
    potentialLovers,
    selectedMatchId,
    setSelectedMatchId,
    betAmount,
    setBetAmount,
    isSubmitting,
    setOpen,
    submit,
    editor,
  } = props

  const [error, setError] = useState<string | undefined>(undefined)
  const [search, setSearch] = useState('')

  const user = useUser()
  const potentialLoversWithYouFirst = filterDefined([
    potentialLovers.find((lover) => lover.user.id === user?.id),
    ...potentialLovers.filter((lover) => lover.user.id !== user?.id),
  ])
  // Then filter by search query, if present
  const results = search
    ? potentialLoversWithYouFirst.filter(
        (lover) =>
          lover.user.name.toLowerCase().includes(search.toLowerCase()) ||
          lover.user.username.toLowerCase().includes(search.toLowerCase())
      )
    : potentialLoversWithYouFirst

  return (
    <Modal className={clsx(MODAL_CLASS, '!px-2 !py-2')} open setOpen={setOpen}>
      <Col className="bg-canvas-0 rounded p-4 pb-8 sm:gap-4">
        <div className="text-lg font-semibold">
          Match {lover.user.name} with...
        </div>
        <Input
          className="w-full"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <Col className="gap-0">
          {potentialLovers.length === 0 && (
            <div>No remaining matches of preferred gender.</div>
          )}

          <Col className="max-h-[300px] overflow-y-auto">
            {results.map((lover) => {
              const selected = selectedMatchId === lover.user.id
              return (
                <Row
                  key={lover.id}
                  className={clsx(
                    'items-center justify-between px-3 py-2',
                    selected && 'bg-primary-100'
                  )}
                >
                  <Row className="gap-2">
                    {lover.pinned_url && (
                      <Avatar
                        avatarUrl={lover.pinned_url}
                        username={lover.user.username}
                      />
                    )}
                    <UserLink user={lover.user} />
                  </Row>
                  <Button
                    size="xs"
                    color="indigo-outline"
                    onClick={() => setSelectedMatchId(lover.user.id)}
                  >
                    Select
                  </Button>
                </Row>
              )
            })}
          </Col>
        </Col>

        {potentialLovers.length > 0 && (
          <Col className="gap-1">
            <div className="text-sm font-bold">Bet on their relationship</div>
            <BuyAmountInput
              amount={betAmount}
              inputClassName={'w-36'}
              onChange={setBetAmount}
              minimumAmount={20}
              error={error}
              setError={setError}
              showBalance
            />
          </Col>
        )}

        <CommentInputTextArea
          isSubmitting={isSubmitting}
          editor={editor}
          user={user}
          hideToolbar={true}
        />

        {isSubmitting && (
          <div className="text-ink-500">
            Can take up to 30 seconds to create match...
          </div>
        )}
        <Button
          className="font-semibold"
          color="green"
          onClick={() => submit()}
          disabled={
            !selectedMatchId || isSubmitting || !betAmount || betAmount < 20
          }
          loading={isSubmitting}
        >
          Submit match
        </Button>
      </Col>
    </Modal>
  )
}
