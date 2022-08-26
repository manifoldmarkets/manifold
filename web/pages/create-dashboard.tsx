import { useState } from 'react'
import { Spacer } from 'web/components/layout/spacer'
import { Page } from 'web/components/page'
import { Title } from 'web/components/title'
import Textarea from 'react-expanding-textarea'

import { TextEditor, useTextEditor } from 'web/components/editor'
import { createDashboard } from 'web/lib/firebase/api'
import clsx from 'clsx'
import { useRouter } from 'next/router'
import { Dashboard, MAX_DASHBOARD_NAME_LENGTH } from 'common/dashboard'
import { dashboardPath } from 'web/lib/firebase/dashboards'

export default function CreateDashboard() {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()

  const { editor, upload } = useTextEditor({
    disabled: isSubmitting,
  })

  const isValid = editor && name.length > 0 && editor.isEmpty === false

  async function saveDashboard(name: string) {
    if (!editor) return
    const newDashboard = {
      name: name,
      content: editor.getJSON(),
    }

    const result = await createDashboard(newDashboard).catch((e) => {
      console.log(e)
      setError('There was an error creating the dashboard, please try again')
      return e
    })
    if (result.dashboard) {
      await router.push(dashboardPath((result.dashboard as Dashboard).slug))
    }
  }

  return (
    <Page>
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-lg px-6 py-4 sm:py-0">
          <Title className="!mt-0" text="Create a dashboard" />
          <form>
            <div className="form-control w-full">
              <label className="label">
                <span className="mb-1">
                  Name<span className={'text-red-700'}>*</span>
                </span>
              </label>
              <Textarea
                placeholder="e.g. Elon Mania Dashboard"
                className="input input-bordered resize-none"
                autoFocus
                maxLength={MAX_DASHBOARD_NAME_LENGTH}
                value={name}
                onChange={(e) => setName(e.target.value || '')}
              />
              <Spacer h={6} />
              <label className="label">
                <span className="mb-1">
                  Content<span className={'text-red-700'}>*</span>
                </span>
              </label>
              <TextEditor editor={editor} upload={upload} />
              <Spacer h={6} />

              <button
                type="submit"
                className={clsx(
                  'btn btn-primary normal-case',
                  isSubmitting && 'loading disabled'
                )}
                disabled={isSubmitting || !isValid || upload.isLoading}
                onClick={async () => {
                  setIsSubmitting(true)
                  await saveDashboard(name)
                  setIsSubmitting(false)
                }}
              >
                {isSubmitting ? 'Creating...' : 'Create a dashboard'}
              </button>
              {error !== '' && <div className="text-red-700">{error}</div>}
            </div>
          </form>
        </div>
      </div>
    </Page>
  )
}
