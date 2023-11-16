import { PencilIcon, XIcon } from '@heroicons/react/outline'
import { JSONContent } from '@tiptap/core'
import { Lover } from 'common/love/lover'
import { useState } from 'react'
import DropdownMenu from 'web/components/comments/dropdown-menu'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Content } from 'web/components/widgets/editor'
import { updateLover } from 'web/lib/firebase/love/api'
import { EditableBio } from './editable-bio'

export function BioBlock(props: {
  isCurrentUser: boolean
  lover: Lover
  refreshLover: () => void
  edit: boolean
  setEdit: (edit: boolean) => void
}) {
  const { isCurrentUser, refreshLover, lover, edit, setEdit } = props

  return (
    <Col
      className={
        'bg-canvas-0 flex-grow whitespace-pre-line rounded-md px-3 py-2 leading-relaxed'
      }
    >
      <Row className="w-full">
        {!edit && (
          <Col className="flex w-full flex-grow">
            <Content className="w-full" content={lover.bio as JSONContent} />
          </Col>
        )}
        {edit && (
          <EditableBio
            lover={lover}
            onCancel={() => setEdit(false)}
            onSave={() => {
              refreshLover()
              setEdit(false)
            }}
          />
        )}
        {isCurrentUser && !edit && (
          <DropdownMenu
            items={[
              {
                name: 'Edit',
                icon: <PencilIcon className="h-5 w-5" />,
                onClick: () => setEdit(true),
              },
              {
                name: 'Delete',
                icon: <XIcon className="h-5 w-5" />,
                onClick: async () => {
                  await updateLover({
                    ...lover,
                    bio: null,
                  }).catch((e) => {
                    console.error(e)
                    return false
                  })
                  refreshLover()
                },
              },
            ]}
            closeOnClick
          />
        )}
      </Row>
    </Col>
  )
}
