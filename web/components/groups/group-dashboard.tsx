import { useAdmin } from 'web/hooks/use-admin'
import { Row } from '../layout/row'
import { Content } from '../editor'
import { TextEditor, useTextEditor } from 'web/components/editor'
import { Button } from '../button'
import { Spacer } from '../layout/spacer'
import { Group } from 'common/group'
import { deleteFieldFromGroup, updateGroup } from 'web/lib/firebase/groups'
import PencilIcon from '@heroicons/react/solid/PencilIcon'
import { DocumentRemoveIcon } from '@heroicons/react/solid'
import { createDashboard } from 'web/lib/firebase/api'
import { Dashboard } from 'common/dashboard'
import { deleteDashboard, updateDashboard } from 'web/lib/firebase/dashboards'
import { useRouter } from 'next/router'
import { useState } from 'react'

export function GroupDashboard(props: {
  group: Group
  isCreator: boolean
  dashboard: Dashboard
}) {
  const { group, isCreator, dashboard } = props
  const isAdmin = useAdmin()

  if (group.dashboardId == null && !isCreator) {
    return <p className="text-center">No dashboard has been created </p>
  }

  return (
    <div className="rounded-md bg-white p-4">
      {isCreator || isAdmin ? (
        <RichEditGroupDashboard group={group} dashboard={dashboard} />
      ) : (
        <Content content={dashboard.content} />
      )}
    </div>
  )
}

function RichEditGroupDashboard(props: { group: Group; dashboard: Dashboard }) {
  const { group, dashboard } = props
  const [editing, setEditing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()

  const { editor, upload } = useTextEditor({
    defaultValue: dashboard.content,
    disabled: isSubmitting,
  })

  async function saveDashboard() {
    if (!editor) return
    const newDashboard = {
      name: group.name,
      content: editor.getJSON(),
    }

    if (group.dashboardId == null) {
      const result = await createDashboard(newDashboard).catch((e) => {
        console.error(e)
        return e
      })
      await updateGroup(group, {
        dashboardId: result.dashboard.id,
      })
    } else {
      await updateDashboard(dashboard, {
        content: newDashboard.content,
      })
    }
    await router.replace(router.asPath)
  }

  async function deleteGroupDashboard() {
    await deleteDashboard(dashboard)
    await deleteFieldFromGroup(group, 'dashboardId')
    await router.replace(router.asPath)
  }

  return editing ? (
    <>
      <TextEditor editor={editor} upload={upload} />
      <Spacer h={2} />
      <Row className="gap-2">
        <Button
          onClick={async () => {
            setIsSubmitting(true)
            await saveDashboard()
            setEditing(false)
            setIsSubmitting(false)
          }}
        >
          Save
        </Button>
        <Button color="gray" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </Row>
    </>
  ) : (
    <>
      {group.dashboardId == null ? (
        <div className="text-center text-gray-500">
          <p className="text-sm">
            No dashboard has been created yet.
            <Spacer h={2} />
            <Button onClick={() => setEditing(true)}>Create a dashboard</Button>
          </p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute top-0 right-0 z-10 space-x-2">
            <Button
              color="gray"
              size="xs"
              onClick={() => {
                setEditing(true)
                editor?.commands.focus('end')
              }}
            >
              <PencilIcon className="inline h-4 w-4" />
              Edit
            </Button>

            <Button
              color="gray"
              size="xs"
              onClick={() => {
                deleteGroupDashboard()
              }}
            >
              <DocumentRemoveIcon className="inline h-4 w-4" />
              Delete
            </Button>
          </div>

          <Content content={dashboard.content} />
          <Spacer h={2} />
        </div>
      )}
    </>
  )
}
