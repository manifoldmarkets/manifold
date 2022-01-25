import _ from 'lodash'
import { useEffect, useState } from 'react'
import { Fold } from '../../common/fold'
import { CreateFoldButton } from '../components/create-fold-button'
import { Col } from '../components/layout/col'
import { Row } from '../components/layout/row'
import { Page } from '../components/page'
import { SiteLink } from '../components/site-link'
import { Title } from '../components/title'
import { UserLink } from '../components/user-page'
import { useFolds } from '../hooks/use-fold'
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
              <Col key={fold.id} className="gap-2">
                <Row className="items-center flex-wrap gap-2">
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
                <div className="text-gray-500 text-sm">{fold.about}</div>
                <div />
              </Col>
            ))}
          </Col>
        </Col>
      </Col>
    </Page>
  )
}
