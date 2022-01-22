import clsx from 'clsx'
import _ from 'lodash'
import { ArrowCircleLeftIcon } from '@heroicons/react/solid'
import { useState } from 'react'
import { Fold } from '../../../../common/fold'
import { parseWordsAsTags } from '../../../../common/util/parse'
import { Col } from '../../../components/layout/col'
import { Spacer } from '../../../components/layout/spacer'
import { Page } from '../../../components/page'
import { TagsList } from '../../../components/tags-list'
import {
  foldPath,
  getFoldBySlug,
  updateFold,
} from '../../../lib/firebase/folds'
import Custom404 from '../../404'
import { SiteLink } from '../../../components/site-link'

export async function getStaticProps(props: { params: { foldSlug: string } }) {
  const { foldSlug } = props.params

  const fold = await getFoldBySlug(foldSlug)

  return {
    props: { fold },

    revalidate: 60, // regenerate after a minute
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function EditFoldPage(props: { fold: Fold | null }) {
  const { fold } = props

  const [name, setName] = useState(fold?.name ?? '')
  const [tags, setTags] = useState(fold?.tags.join(', ') ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!fold) return <Custom404 />

  const saveDisabled =
    !name ||
    !tags ||
    (name === fold.name && _.isEqual(parseWordsAsTags(tags), fold.tags))

  const onSubmit = async () => {
    setIsSubmitting(true)

    await updateFold(fold, { name, tags: parseWordsAsTags(tags) })

    setIsSubmitting(false)
  }

  return (
    <Page>
      <Col className="items-center">
        <Col className="max-w-2xl w-full px-2 sm:px-0">
          <SiteLink href={foldPath(fold)}>
            <ArrowCircleLeftIcon className="h-5 w-5 text-gray-500 inline mr-1" />{' '}
            {fold.name}
          </SiteLink>

          <Spacer h={4} />

          <div className="form-control w-full">
            <label className="label">
              <span className="mb-1">Fold name</span>
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
              <span className="mb-1">Tags</span>
            </label>

            <input
              placeholder="Politics, Economics, Rationality"
              className="input input-bordered resize-none"
              disabled={isSubmitting}
              value={tags}
              onChange={(e) => setTags(e.target.value || '')}
            />
          </div>

          <Spacer h={4} />
          <TagsList
            tags={parseWordsAsTags(tags).map((tag) => `#${tag}`)}
            noLink
          />
          <Spacer h={4} />

          <button
            className={clsx(
              'btn self-end',
              saveDisabled ? 'btn-disabled' : 'btn-primary',
              isSubmitting && 'loading'
            )}
            onClick={onSubmit}
          >
            Save
          </button>
        </Col>
      </Col>
    </Page>
  )
}
