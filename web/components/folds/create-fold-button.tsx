import clsx from 'clsx'
import { useRouter } from 'next/router'
import { useState } from 'react'
import { PlusCircleIcon } from '@heroicons/react/solid'
import { parseWordsAsTags } from 'common/util/parse'
import { createGroup } from 'web/lib/firebase/fn-call'
import { groupPath } from 'web/lib/firebase/groups'
import { toCamelCase } from 'common/util/format'
import { ConfirmationButton } from '../confirmation-button'
import { Col } from '../layout/col'
import { Spacer } from '../layout/spacer'
import { Title } from '../title'

export function CreateFoldButton() {
  const [name, setName] = useState('')
  const [about, setAbout] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const router = useRouter()

  const tags = parseWordsAsTags(toCamelCase(name))

  const updateName = (newName: string) => {
    setName(newName)
  }

  const onSubmit = async () => {
    setIsSubmitting(true)

    const result = await createGroup({
      name,
      tags,
      about,
    })
      .then((r) => r.data || {})
      .catch((e) => {
        console.error(e)
        return e
      })

    if (result.group) {
      await router.push(groupPath(result.group)).catch((e) => {
        console.log(e)
        setIsSubmitting(false)
      })
    } else {
      console.log(result.status, result.message)
      setIsSubmitting(false)
    }
  }

  return (
    <ConfirmationButton
      openModalBtn={{
        label: 'New',
        icon: <PlusCircleIcon className="mr-2 h-5 w-5" />,
        className: clsx(
          isSubmitting ? 'loading btn-disabled' : 'btn-primary',
          'btn-sm'
        ),
      }}
      submitBtn={{
        label: 'Create',
        className: clsx(name ? 'btn-primary' : 'btn-disabled'),
      }}
      onSubmit={onSubmit}
    >
      <Title className="!mt-0" text="Create a group" />

      <Col className="gap-1 text-gray-500">
        <div>Markets are included in a group if you add them on creation.</div>
      </Col>

      {/*<Spacer h={4} />*/}

      <div>
        <div className="form-control w-full">
          <label className="label">
            <span className="mb-1">Group name</span>
          </label>

          <input
            placeholder="Name"
            className="input input-bordered resize-none"
            disabled={isSubmitting}
            value={name}
            maxLength={140}
            onChange={(e) => updateName(e.target.value || '')}
          />
        </div>

        <Spacer h={4} />

        <div className="form-control w-full">
          <label className="label">
            <span className="mb-1">Description</span>
          </label>

          <input
            placeholder="Short description (140 characters max, optional)"
            className="input input-bordered resize-none"
            disabled={isSubmitting}
            value={about}
            maxLength={140}
            onChange={(e) => setAbout(e.target.value || '')}
          />
        </div>

        <Spacer h={4} />

        {/*<label className="label">*/}
        {/*  <span className="mb-1">Primary tag</span>*/}
        {/*</label>*/}
        {/*<TagsList noLink noLabel tags={[`#${toCamelCase(name)}`]} />*/}

        {/*<Spacer h={4} />*/}

        {/*<div className="form-control w-full">*/}
        {/*  <label className="label">*/}
        {/*    <span className="mb-1">Additional tags</span>*/}
        {/*  </label>*/}

        {/*  <input*/}
        {/*    placeholder="Politics, Economics, Rationality (Optional)"*/}
        {/*    className="input input-bordered resize-none"*/}
        {/*    disabled={isSubmitting}*/}
        {/*    value={otherTags}*/}
        {/*    onChange={(e) => setOtherTags(e.target.value || '')}*/}
        {/*  />*/}
        {/*</div>*/}

        <Spacer h={4} />

        {/*<TagsList*/}
        {/*  tags={parseWordsAsTags(otherTags).map((tag) => `#${tag}`)}*/}
        {/*  noLink*/}
        {/*  noLabel*/}
        {/*/>*/}
      </div>
    </ConfirmationButton>
  )
}
