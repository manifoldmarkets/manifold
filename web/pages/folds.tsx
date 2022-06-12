import { sortBy, debounce } from 'lodash'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Fold } from 'common/fold'
import { CreateFoldButton } from 'web/components/folds/create-fold-button'
import { FollowFoldButton } from 'web/components/folds/follow-fold-button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/page'
import { TagsList } from 'web/components/tags-list'
import { Title } from 'web/components/title'
import { UserLink } from 'web/components/user-page'
import { useFolds, useFollowedFoldIds } from 'web/hooks/use-fold'
import { useUser } from 'web/hooks/use-user'
import { foldPath, listAllFolds } from 'web/lib/firebase/folds'
import { getUser, User } from 'web/lib/firebase/users'

export async function getStaticProps() {
  const folds = await listAllFolds().catch((_) => [])

  const curators = await Promise.all(
    folds.map((fold) => getUser(fold.curatorId))
  )
  const curatorsDict = Object.fromEntries(
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
  curatorsDict: { [k: string]: User }
}) {
  const [curatorsDict, setCuratorsDict] = useState(props.curatorsDict)

  const folds = useFolds() ?? props.folds
  const user = useUser()
  const followedFoldIds = useFollowedFoldIds(user) || []

  useEffect(() => {
    // Load User object for curator of new Folds.
    const newFolds = folds.filter(({ curatorId }) => !curatorsDict[curatorId])
    if (newFolds.length > 0) {
      Promise.all(newFolds.map(({ curatorId }) => getUser(curatorId))).then(
        (newUsers) => {
          const newUsersDict = Object.fromEntries(
            newUsers.map((user) => [user.id, user])
          )
          setCuratorsDict({ ...curatorsDict, ...newUsersDict })
        }
      )
    }
  }, [curatorsDict, folds])

  const [query, setQuery] = useState('')
  // Copied from contracts-list.tsx; extract if we copy this again
  const queryWords = query.toLowerCase().split(' ')
  function check(corpus: string) {
    return queryWords.every((word) => corpus.toLowerCase().includes(word))
  }

  // List followed folds first, then folds with the highest follower count
  const matches = sortBy(folds, [
    (fold) => !followedFoldIds.includes(fold.id),
    (fold) => -1 * fold.followCount,
  ]).filter(
    (f) =>
      check(f.name) ||
      check(f.about || '') ||
      check(curatorsDict[f.curatorId].username) ||
      check(f.lowercaseTags.map((tag) => `#${tag}`).join(' '))
  )
  // Not strictly necessary, but makes the "hold delete" experience less laggy
  const debouncedQuery = debounce(setQuery, 50)

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
      className="relative gap-1 rounded-xl bg-white dark:bg-black p-8 shadow-md hover:bg-gray-100 dark:hover:bg-gray-900"
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
