import clsx from 'clsx'
import _ from 'lodash'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { Fold } from '../../common/fold'
import { parseWordsAsTags } from '../../common/util/parse'
import { ConfirmationButton } from '../components/confirmation-button'
import { Col } from '../components/layout/col'
import { Row } from '../components/layout/row'
import { Spacer } from '../components/layout/spacer'
import { Page } from '../components/page'
import { SiteLink } from '../components/site-link'
import { TagsList } from '../components/tags-list'
import { Title } from '../components/title'
import { UserLink } from '../components/user-page'
import { useFolds } from '../hooks/use-fold'
import { useUser } from '../hooks/use-user'
import { createFold } from '../lib/firebase/api-call'
import { foldPath, listAllFolds } from '../lib/firebase/folds'
import { getUser, User } from '../lib/firebase/users'
import { toCamelCase } from '../lib/util/format'

export async function getStaticProps() {
  const folds = await listAllFolds().catch((_) => [])

  const curators = await Promise.all(
    folds.map((fold) => getUser(fold.curatorId))
  )
  const curatorsDict = _.fromPairs(
    curators.map((curator) => [curator.id, curator])
  )

  return {
    props: {
      folds,
      curatorsDict,
    },

    revalidate: 60, // regenerate after a minute
  }
}

export default function Folds(props: {
  folds: Fold[]
  curatorsDict: _.Dictionary<User>
}) {
  const [curatorsDict, setCuratorsDict] = useState(props.curatorsDict)

  const folds = useFolds() ?? props.folds
  const user = useUser()

  useEffect(() => {
    // Load User object for curator of new Folds.
    const newFolds = folds.filter(({ curatorId }) => !curatorsDict[curatorId])
    if (newFolds.length > 0) {
      Promise.all(newFolds.map(({ curatorId }) => getUser(curatorId))).then(
        (newUsers) => {
          const newUsersDict = _.fromPairs(
            newUsers.map((user) => [user.id, user])
          )
          setCuratorsDict({ ...curatorsDict, ...newUsersDict })
        }
      )
    }
  })

  return (
    <Page>
      <Col className="items-center">
        <Col className="max-w-2xl w-full px-2 sm:px-0">
          <Row className="justify-between items-center">
            <Title text="Manifold communities: Folds" />
            {user && <CreateFoldButton />}
          </Row>

          <div className="text-gray-500 mb-6">
            Browse folds on topics that interest you.
          </div>

          <Col className="gap-4">
            {folds.map((fold) => (
              <Row key={fold.id} className="items-center gap-2">
                <SiteLink href={foldPath(fold)}>{fold.name}</SiteLink>
                <div />
                <div className="text-sm text-gray-500">12 followers</div>
                <div className="text-gray-500">•</div>
                <Row>
                  <div className="text-sm text-gray-500 mr-1">Curated by</div>
                  <UserLink
                    className="text-sm text-neutral"
                    name={curatorsDict[fold.curatorId]?.name ?? ''}
                    username={curatorsDict[fold.curatorId]?.username ?? ''}
                  />
                </Row>
              </Row>
            ))}
          </Col>
        </Col>
      </Col>
    </Page>
  )
}

function CreateFoldButton() {
  const [name, setName] = useState('')
  const [about, setAbout] = useState('')
  const [otherTags, setOtherTags] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const router = useRouter()

  const tags = parseWordsAsTags(toCamelCase(name) + ' ' + otherTags)

  const updateName = (newName: string) => {
    setName(newName)
  }

  const onSubmit = async () => {
    setIsSubmitting(true)

    const result = await createFold({
      name,
      tags,
      about,
    }).then((r) => r.data || {})

    if (result.fold) {
      await router.push(foldPath(result.fold)).catch((e) => {
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
      id="create-fold"
      openModelBtn={{
        label: 'Create a fold',
        className: clsx(
          isSubmitting ? 'loading btn-disabled' : 'btn-primary',
          'btn-sm'
        ),
      }}
      submitBtn={{
        label: 'Create',
        className: clsx(name && about ? 'btn-primary' : 'btn-disabled'),
      }}
      onSubmit={onSubmit}
    >
      <Title className="!mt-0" text="Create a fold" />

      <Col className="text-gray-500 gap-1">
        <div>A fold is a sub-community of markets organized on a topic.</div>
        <div>Markets are included if they match one or more tags.</div>
      </Col>

      <Spacer h={4} />

      <div>
        <div className="form-control w-full">
          <label className="label">
            <span className="mb-1">Fold name</span>
          </label>

          <input
            placeholder="Your fold name"
            className="input input-bordered resize-none"
            disabled={isSubmitting}
            value={name}
            onChange={(e) => updateName(e.target.value || '')}
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

        <label className="label">
          <span className="mb-1">Primary tag</span>
        </label>
        <TagsList noLink tags={[`#${toCamelCase(name)}`]} />

        <Spacer h={4} />

        <div className="form-control w-full">
          <label className="label">
            <span className="mb-1">Additional tags</span>
          </label>

          <input
            placeholder="Politics, Economics, Rationality (Optional)"
            className="input input-bordered resize-none"
            disabled={isSubmitting}
            value={otherTags}
            onChange={(e) => setOtherTags(e.target.value || '')}
          />
        </div>

        <Spacer h={4} />

        <TagsList
          tags={parseWordsAsTags(otherTags).map((tag) => `#${tag}`)}
          noLink
        />
      </div>
    </ConfirmationButton>
  )
}
