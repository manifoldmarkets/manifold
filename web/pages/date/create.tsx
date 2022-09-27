import Router from 'next/router'
import { useEffect, useState } from 'react'
import Textarea from 'react-expanding-textarea'

import { DateDoc } from 'common/post'
import { useTextEditor, TextEditor } from 'web/components/editor'
import { Page } from 'web/components/page'
import { Title } from 'web/components/title'
import { useUser } from 'web/hooks/use-user'
import { createPost } from 'web/lib/firebase/api'
import { postPath } from 'web/lib/firebase/posts'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/button'
import dayjs from 'dayjs'
import { MINUTE_MS } from 'common/util/time'
import { Col } from 'web/components/layout/col'
import { uploadImage } from 'web/lib/firebase/storage'
import { LoadingIndicator } from 'web/components/loading-indicator'
import { MAX_QUESTION_LENGTH } from 'common/contract'

export default function CreateDateDocPage() {
  const user = useUser()

  useEffect(() => {
    if (user === null) Router.push('/date')
  })

  const title = `${user?.name}'s Date Doc`
  const [birthday, setBirthday] = useState<undefined | string>(undefined)
  const [photoUrl, setPhotoUrl] = useState('')
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [question, setQuestion] = useState(
    'Will I find a partner in the next 3 months?'
  )

  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { editor, upload } = useTextEditor({
    disabled: isSubmitting,
  })

  const birthdayTime = birthday ? dayjs(birthday).valueOf() : undefined
  const isValid =
    user &&
    birthday &&
    photoUrl &&
    editor &&
    editor.isEmpty === false &&
    question

  const fileHandler = async (event: any) => {
    if (!user) return

    const file = event.target.files[0]

    setAvatarLoading(true)

    await uploadImage(user.username, file)
      .then(async (url) => {
        setPhotoUrl(url)
        setAvatarLoading(false)
      })
      .catch(() => {
        setAvatarLoading(false)
        setPhotoUrl('')
      })
  }

  async function saveDateDoc() {
    if (!editor || !birthdayTime) return

    const newPost: Omit<
      DateDoc,
      'id' | 'creatorId' | 'createdTime' | 'slug' | 'contractSlug'
    > & { question: string } = {
      title,
      content: editor.getJSON(),
      bounty: 0,
      birthday: birthdayTime,
      photoUrl,
      type: 'date-doc',
      question,
    }

    const result = await createPost(newPost).catch((e) => {
      console.log(e)
      setError('There was an error creating the post, please try again')
      return e
    })
    if (result.post) {
      await Router.push(postPath(result.post.slug))
    }
  }

  return (
    <Page>
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-lg px-6 py-4 pb-4 sm:py-0">
          <Row className="mb-8 items-center justify-between">
            <Title className="!my-0 text-blue-500" text="Your Date Doc" />
            <Button
              type="submit"
              disabled={isSubmitting || !isValid || upload.isLoading}
              onClick={async () => {
                setIsSubmitting(true)
                await saveDateDoc()
                setIsSubmitting(false)
              }}
              color="blue"
            >
              {isSubmitting ? 'Publishing...' : 'Publish'}
            </Button>
          </Row>

          <Col className="gap-8">
            <Col className="max-w-[160px] justify-start gap-4">
              <div className="">Birthday</div>
              <input
                type={'date'}
                className="input input-bordered"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setBirthday(e.target.value)}
                max={Math.round(Date.now() / MINUTE_MS) * MINUTE_MS}
                disabled={isSubmitting}
                value={birthday}
              />
            </Col>

            <Col className="gap-4">
              <div className="">Photo</div>
              <Row className="items-center gap-4">
                {avatarLoading ? (
                  <LoadingIndicator />
                ) : (
                  <>
                    {photoUrl && (
                      <img
                        src={photoUrl}
                        width={80}
                        height={80}
                        className="flex h-[80px] w-[80px] items-center justify-center rounded-lg bg-gray-400 object-cover"
                      />
                    )}
                    <input
                      className="text-sm text-gray-500"
                      type="file"
                      name="file"
                      accept="image/*"
                      onChange={fileHandler}
                    />
                  </>
                )}
              </Row>
            </Col>

            <Col className="gap-4">
              <div className="">
                Tell us about you! What are you looking for?
              </div>
              <TextEditor editor={editor} upload={upload} />
            </Col>

            <Col className="gap-4">
              <div className="">
                Finally, we'll create an (unlisted) prediction market!
              </div>

              <Col className="gap-2">
                <Textarea
                  className="input input-bordered resize-none"
                  maxLength={MAX_QUESTION_LENGTH}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value || '')}
                />
                <div className="ml-2 text-gray-500">Cost: M$100</div>
              </Col>
            </Col>
          </Col>
        </div>
      </div>
    </Page>
  )
}
