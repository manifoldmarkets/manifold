import { track } from '@amplitude/analytics-browser'
import clsx from 'clsx'
import { MAX_DESCRIPTION_LENGTH } from 'common/contract'
import {
  DashboardItem,
  DashboardLinkItem,
  DashboardQuestionItem,
} from 'common/dashboard'
import { removeUndefinedProps } from 'common/util/object'
import router from 'next/router'
import { useEffect, useState } from 'react'
import { SEO } from 'web/components/SEO'
import { Button } from 'web/components/buttons/button'
import { DashboardAddContractButton } from 'web/components/dashboard/dashboard-add-contract-button'
import { DashboardAddLinkButton } from 'web/components/dashboard/dashboard-add-link-button'
import { DashboardContent } from 'web/components/dashboard/dashboard-content'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { TextEditor, useTextEditor } from 'web/components/widgets/editor'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { Title } from 'web/components/widgets/title'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { createDashboard } from 'web/lib/firebase/api'

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

  const [items, setItems] = usePersistentLocalState<DashboardItem[]>(
    [],
    'create dashboard items'
  )

  const isValid = title.length > 0

  useEffect(() => {
    setErrorText('')
  }, [isValid])

  const resetProperties = () => {
    editor?.commands.clearContent(true)
    setTitle('')
    setItems([])
  }

  async function submit() {
    if (!isValid) return
    setSubmitState('LOADING')
    try {
      const createProps = removeUndefinedProps({
        title,
        description: editor?.getJSON(),
        items,
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

  return (
    <Page trackPageView={'create dashboard page'}>
      <SEO
        title="Create a dashboard"
        description="Create a collection of prediction markets."
        url="/dashboard/create"
      />
      <Col
        className={clsx(
          ' text-ink-1000 mx-auto w-full max-w-2xl py-2 transition-colors'
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
          />
        </Col>
        <Spacer h={6} />
        <Col>
          <label className="gap-2 px-1 py-2">
            <span className="mb-1">Description</span>
          </label>
          <TextEditor editor={editor} />
        </Col>
        <Spacer h={6} />
        <div className="mb-2">Content</div>
        {items.length > 0 && (
          <DashboardContent
            items={items}
            onRemove={(slugOrUrl: string) => {
              setItems((items) => {
                return items.filter((item) => {
                  if (item.type === 'question') {
                    return item.slug !== slugOrUrl
                  } else if (item.type === 'link') {
                    return item.url !== slugOrUrl
                  }
                  return true
                })
              })
            }}
            isEditing
          />
        )}
        <Row className="border-ink-200 text-ink-400 items-center gap-4 rounded-lg border-2 border-dashed p-2">
          <DashboardAddContractButton
            addQuestions={(questions: DashboardQuestionItem[]) => {
              setItems((items) => [...items, ...questions])
            }}
          />
          OR
          <DashboardAddLinkButton
            addLink={(link: DashboardLinkItem) => {
              setItems((items) => [...items, link])
            }}
          />
        </Row>
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
