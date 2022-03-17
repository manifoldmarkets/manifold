import { useState } from 'react'
import _ from 'lodash'
import clsx from 'clsx'
import { PencilIcon } from '@heroicons/react/outline'

import { Fold } from '../../../common/fold'
import { parseWordsAsTags } from '../../../common/util/parse'
import { deleteFold, updateFold } from '../../lib/firebase/folds'
import { toCamelCase } from '../../../common/util/format'
import { Spacer } from '../layout/spacer'
import { TagsList } from '../tags-list'
import { useRouter } from 'next/router'

export function EditFoldButton(props: { fold: Fold; className?: string }) {
  const { fold, className } = props
  const router = useRouter()

  const [name, setName] = useState(fold.name)
  const [about, setAbout] = useState(fold.about ?? '')

  const initialOtherTags =
    fold?.tags.filter((tag) => tag !== toCamelCase(name)).join(', ') ?? ''

  const [otherTags, setOtherTags] = useState(initialOtherTags)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const tags = parseWordsAsTags(toCamelCase(name) + ' ' + otherTags)
  const lowercaseTags = tags.map((tag) => tag.toLowerCase())

  const saveDisabled =
    name === fold.name &&
    _.isEqual(tags, fold.tags) &&
    about === (fold.about ?? '')

  const onSubmit = async () => {
    setIsSubmitting(true)

    await updateFold(fold, {
      name,
      about,
      tags,
      lowercaseTags,
    })

    setIsSubmitting(false)
  }

  return (
    <div className={clsx('p-1', className)}>
      <label
        htmlFor="edit"
        className={clsx(
          'modal-button cursor-pointer whitespace-nowrap text-sm text-gray-700'
        )}
      >
        <PencilIcon className="inline h-4 w-4" /> Edit
      </label>
      <input type="checkbox" id="edit" className="modal-toggle" />

      <div className="modal">
        <div className="modal-box">
          <div className="form-control w-full">
            <label className="label">
              <span className="mb-1">Community name</span>
            </label>

            <input
              placeholder="Your fold name"
              className="input input-bordered resize-none"
              disabled={isSubmitting}
              value={name}
              onChange={(e) => setName(e.target.value || '')}
            />
          </div>

          <Spacer h={4} />

          <div className="form-control w-full">
            <label className="label">
              <span className="mb-1">About</span>
            </label>

            <input
              placeholder="Short description (140 characters max)"
              className="input input-bordered resize-none"
              disabled={isSubmitting}
              value={about}
              maxLength={140}
              onChange={(e) => setAbout(e.target.value || '')}
            />
          </div>

          <Spacer h={4} />

          <div className="form-control w-full">
            <label className="label">
              <span className="mb-1">Tags</span>
            </label>

            <input
              placeholder="Politics, Economics, Rationality"
              className="input input-bordered resize-none"
              disabled={isSubmitting}
              value={otherTags}
              onChange={(e) => setOtherTags(e.target.value || '')}
            />
          </div>

          <Spacer h={4} />
          <TagsList tags={tags} noLink noLabel />
          <Spacer h={4} />

          <div className="modal-action">
            <label
              htmlFor="edit"
              onClick={() => {
                if (confirm('Are you sure you want to delete this fold?')) {
                  deleteFold(fold)
                  router.replace('/folds')
                }
              }}
              className={clsx(
                'btn btn-sm btn-outline mr-auto self-center hover:border-red-500 hover:bg-red-500'
              )}
            >
              Delete
            </label>
            <label htmlFor="edit" className={clsx('btn')}>
              Cancel
            </label>
            <label
              className={clsx(
                'btn',
                saveDisabled ? 'btn-disabled' : 'btn-primary',
                isSubmitting && 'loading'
              )}
              htmlFor="edit"
              onClick={onSubmit}
            >
              Save
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}
