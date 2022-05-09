import _ from 'lodash'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Fold } from 'common/fold'
import { CreateFoldButton } from '../components/folds/create-fold-button'
import { FollowFoldButton } from '../components/folds/follow-fold-button'
import { Col } from '../components/layout/col'
import { Row } from '../components/layout/row'
import { Page } from '../components/page'
import { TagsList } from '../components/tags-list'
import { Title } from '../components/title'
import { UserLink } from '../components/user-page'
import { useFolds, useFollowedFoldIds } from '../hooks/use-fold'
import { useUser } from '../hooks/use-user'
import { foldPath, listAllFolds } from '../lib/firebase/folds'
import { getUser, User } from '../lib/firebase/users'

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

  let folds = useFolds() ?? props.folds
  const user = useUser()
  const followedFoldIds = useFollowedFoldIds(user) || []
  // First sort by follower count, then list followed folds first
  folds = _.sortBy(folds, (fold) => -1 * fold.followCount)
  folds = _.sortBy(folds, (fold) => !followedFoldIds.includes(fold.id))

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
  }, [curatorsDict])

  const [query, setQuery] = useState('')
  // Copied from contracts-list.tsx; extract if we copy this again
  const queryWords = query.toLowerCase().split(' ')
  function check(corpus: String) {
    return queryWords.every((word) => corpus.toLowerCase().includes(word))
  }

  const matches = folds.filter(
    (f) =>
      check(f.name) ||
      check(f.about || '') ||
      check(curatorsDict[f.curatorId].username) ||
      check(f.lowercaseTags.map((tag) => `#${tag}`).join(' '))
  )
  // Not strictly necessary, but makes the "hold delete" experience less laggy
  const debouncedQuery = _.debounce(setQuery, 50)

  return (
    <Page>
      <Col className="items-center">
        <Col className="w-full max-w-xl">
          <Col className="px-4 sm:px-0">
            <Row className="items-center justify-between">
              <Title text="Explore communities" />
              {user && <CreateFoldButton />}
            </Row>

            <div className="mb-6 text-gray-500">
              Communities on Manifold are centered around a collection of
              markets. Follow a community to personalize your feed!
            </div>

            <input
              type="text"
              onChange={(e) => debouncedQuery(e.target.value)}
              placeholder="Search communities"
              className="input input-bordered mb-4 w-full"
            />
          </Col>

          <Col className="gap-4">
            {matches.map((fold) => (
              <FoldCard
                key={fold.id}
                fold={fold}
                curator={curatorsDict[fold.curatorId]}
              />
            ))}
          </Col>
        </Col>
      </Col>
    </Page>
  )
}

function FoldCard(props: { fold: Fold; curator: User | undefined }) {
  const { fold, curator } = props
  const tags = fold.tags.slice(1)
  return (
    <Col
      key={fold.id}
      className="relative gap-1 rounded-xl bg-white p-8 shadow-md hover:bg-gray-100"
    >
      <Link href={foldPath(fold)}>
        <a className="absolute left-0 right-0 top-0 bottom-0" />
      </Link>
      <Row className="items-center justify-between gap-2">
        <span className="text-xl">{fold.name}</span>
        <FollowFoldButton className="z-10 mb-1" fold={fold} />
      </Row>
      <Row className="items-center gap-2 text-sm text-gray-500">
        <div>{fold.followCount} followers</div>
        <div>•</div>
        <Row>
          <div className="mr-1">Curated by</div>
          <UserLink
            className="text-neutral"
            name={curator?.name ?? ''}
            username={curator?.username ?? ''}
          />
        </Row>
      </Row>
      <div className="text-sm text-gray-500">{fold.about}</div>
      {tags.length > 0 && (
        <TagsList className="mt-4" tags={tags} noLink noLabel />
      )}
    </Col>
  )
}
