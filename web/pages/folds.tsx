import _ from 'lodash'
import { Fold } from '../../common/fold'
import { Col } from '../components/layout/col'
import { Row } from '../components/layout/row'
import { Page } from '../components/page'
import { SiteLink } from '../components/site-link'
import { Title } from '../components/title'
import { UserLink } from '../components/user-page'
import { foldPath, listAllFolds } from '../lib/firebase/folds'
import { getUser, User } from '../lib/firebase/users'

export async function getStaticProps() {
  const folds = await listAllFolds().catch((_) => [])

  const curators = await Promise.all(
    folds.map((fold) => getUser(fold.curatorId))
  )

  return {
    props: {
      folds,
      curators,
    },

    revalidate: 60, // regenerate after a minute
  }
}

export default function Folds(props: { folds: Fold[]; curators: User[] }) {
  const { folds, curators } = props

  return (
    <Page>
      <Title text="Folds" />

      <Col className="gap-4">
        {folds.map((fold, index) => (
          <Row className="items-center">
            <SiteLink href={foldPath(fold)}>{fold.name}</SiteLink>
            <div className="text-sm text-gray-500 ml-4 mr-1">Curated by</div>
            <UserLink
              className="text-sm text-neutral"
              name={curators[index].name}
              username={curators[index].username}
            />
          </Row>
        ))}
      </Col>
    </Page>
  )
}
