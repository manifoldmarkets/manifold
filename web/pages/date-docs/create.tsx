import Router from 'next/router'
import { useState } from 'react'
import { DateDoc } from 'common/post'
import { useTextEditor, TextEditor } from 'web/components/widgets/editor'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { useUser } from 'web/hooks/use-user'
import { createPost } from 'web/lib/firebase/api'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import dayjs from 'dayjs'
import { MINUTE_MS } from 'common/util/time'
import { Col } from 'web/components/layout/col'
import { MAX_QUESTION_LENGTH } from 'common/contract'
import { NoSEO } from 'web/components/NoSEO'
import ShortToggle from 'web/components/widgets/short-toggle'
import { removeUndefinedProps } from 'common/util/object'
import { Input } from 'web/components/widgets/input'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { ENV_CONFIG } from 'common/envs/constants'

export default function CreateDateDocPage() {
  const user = useUser()

  useRedirectIfSignedOut()

  const title = `${user?.name}'s Date Doc`
  const [birthday, setBirthday] = useState<undefined | string>(undefined)
  const [createMarket, setCreateMarket] = useState(true)
  const [question, setQuestion] = useState(
    'Will I find a partner in the next 3 months?'
  )

  const [isSubmitting, setIsSubmitting] = useState(false)

  const editor = useTextEditor({ size: 'lg' })

  const birthdayTime = birthday ? dayjs(birthday).valueOf() : undefined
  const isValid =
    user &&
    birthday &&
    editor &&
    editor.isEmpty === false &&
    (question || !createMarket)

  async function saveDateDoc() {
    if (!user || !editor || !birthdayTime) return

    const newPost: Omit<
      DateDoc,
      | 'id'
      | 'creatorId'
      | 'createdTime'
      | 'slug'
      | 'contractSlug'
      | 'creatorUsername'
      | 'creatorName'
    > & { question?: string } = removeUndefinedProps({
      title,
      content: editor.getJSON(),
      bounty: 0,
      birthday: birthdayTime,
      type: 'date-doc',
      question: createMarket ? question : undefined,
      visibility: 'public',
    })

    const result = await createPost(newPost)

    if (result.post) {
      await Router.push(`/date-docs/${user.username}`)
    }
  }

  return (
    <Page>
      <NoSEO />
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-lg px-6 py-4 pb-4 sm:py-0">
          <Row className="mb-8 items-center justify-between">
            <Title className="!my-0">Your date doc</Title>
            <Button
              type="submit"
              loading={isSubmitting}
              disabled={!isValid || editor.storage.upload.mutation.isLoading}
              onClick={async () => {
                setIsSubmitting(true)
                await saveDateDoc()
                setIsSubmitting(false)
              }}
            >
              {isSubmitting ? 'Publishing...' : 'Publish'}
            </Button>
          </Row>

          <Col className="gap-8">
            <Col className="max-w-[160px] justify-start gap-4">
              <div>Birthday</div>
              <Input
                type={'date'}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setBirthday(e.target.value)}
                max={Math.round(Date.now() / MINUTE_MS) * MINUTE_MS}
                disabled={isSubmitting}
                value={birthday}
              />
            </Col>

            <Col className="gap-4">
              <div>Tell us about you! What are you looking for?</div>
              <TextEditor editor={editor} />
            </Col>

            <Col className="gap-4">
              <Row className="items-center gap-4">
                <ShortToggle
                  on={createMarket}
                  setOn={(on) => setCreateMarket(on)}
                />
                Create a (private) question attached to the date doc
              </Row>

              <Col className="gap-2">
                <ExpandingInput
                  maxLength={MAX_QUESTION_LENGTH}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value || '')}
                  disabled={!createMarket}
                />
                <div className="text-ink-500 ml-2">
                  Cost: {ENV_CONFIG.moneyMoniker}100
                </div>
              </Col>
            </Col>
          </Col>
        </div>
      </div>
    </Page>
  )
}
