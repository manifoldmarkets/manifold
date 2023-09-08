import clsx from 'clsx'
import { MAX_DESCRIPTION_LENGTH } from 'common/contract'
import { useEffect, useState } from 'react'
import { SEO } from 'web/components/SEO'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Spacer } from 'web/components/layout/spacer'
import { TextEditor, useTextEditor } from 'web/components/widgets/editor'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { Title } from 'web/components/widgets/title'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { removeUndefinedProps } from 'common/util/object'
import { createDashboard } from 'web/lib/firebase/api'
import { track } from '@amplitude/analytics-browser'
import { safeLocalStorage } from 'web/lib/util/local'
import router from 'next/router'

export default function CreateDashboard() {
  const [title, setTitle] = usePersistentLocalState(
    '',
    'create dashboard title'
  )

  const editor = useTextEditor({
    key: 'create dashbord dsecription',
    max: MAX_DESCRIPTION_LENGTH,
    placeholder: 'Optional. Provide background info and details.',
  })

  const [submitState, setSubmitState] = useState<
    'EDITING' | 'LOADING' | 'DONE'
  >('EDITING')

  const [errorText, setErrorText] = useState<string>('')

  const isValid = title.length > 0

  useEffect(() => {
    setErrorText('')
  }, [isValid])

  const resetProperties = () => {
    editor?.commands.clearContent(true)
    setTitle('')
  }

  async function submit() {
    if (!isValid) return
    setSubmitState('LOADING')
    try {
      const createProps = removeUndefinedProps({
        title,
        description: editor?.getJSON(),
      })
      const newDashboard = await createDashboard(createProps)

      track('create market', {
        id: newDashboard.id,
        slug: newDashboard.slug,
      })

      resetProperties()
      setSubmitState('DONE')

      try {
        await router.push(`/dashboard/${newDashboard.slug}`)
      } catch (error) {
        console.error(error)
      }
    } catch (e) {
      console.error('error creating dashboard', e)
      setErrorText((e as any).message || 'Error creating contract')
      setSubmitState('EDITING')
    }
  }
  console.log(editor?.getJSON())

  return (
    <Page>
      <SEO
        title="Create a dashboard"
        description="Create a collection of prediction markets."
        url="/dashboard/create"
      />
      <Col
        className={clsx(
          ' text-ink-1000 bg-canvas-0 mx-auto w-full max-w-2xl py-2 px-6 transition-colors'
        )}
      >
        <Title>Create a Dashboard</Title>
        <Col>
          <label className="px-1 pt-2 pb-3">
            Title<span className={'text-scarlet-500'}>*</span>
          </label>

          <ExpandingInput
            placeholder={'Dashboard Title'}
            autoFocus
            maxLength={150}
            value={title}
            onChange={(e) => setTitle(e.target.value || '')}
            className="bg-canvas-50"
          />
        </Col>
        <Spacer h={6} />
        <Col>
          <label className="gap-2 px-1 py-2">
            <span className="mb-1">Description</span>
          </label>
          <TextEditor editor={editor} className="bg-canvas-50" />
        </Col>
        <Spacer h={6} />
        <span className={'text-error'}>{errorText}</span>

        <Button
          className="w-full"
          type="submit"
          color={submitState === 'DONE' ? 'green' : 'indigo'}
          size="xl"
          loading={submitState === 'LOADING'}
          disabled={!isValid}
          onClick={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          {submitState === 'EDITING'
            ? 'Create Dashboard'
            : submitState === 'LOADING'
            ? 'Creating...'
            : 'Created!'}
        </Button>
      </Col>
    </Page>
  )
}
