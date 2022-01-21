import _ from 'lodash'
import { useState } from 'react'
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
      <Col className="items-center">
        <Col className="max-w-2xl w-full px-2 sm:px-0">
          <Row className="justify-between items-center">
            <Title text="Folds" />
            <ConfirmationButton
              id="create-fold"
              openModelBtn={{
                label: 'Create a fold',
                className: 'btn-primary btn-sm',
              }}
              submitBtn={{ label: 'Create', className: 'btn-primary' }}
              onSubmit={() => {}}
            >
              <Title className="!mt-0" text="Create a fold" />

              <div className="text-gray-500">
                <div>A fold is a view of markets that match selected tags.</div>
                <div>
                  You can further include or exclude individual markets.
                </div>
              </div>

              <Spacer h={4} />

              <CreateFoldForm />
            </ConfirmationButton>
          </Row>

          <Col className="gap-4">
            {folds.map((fold, index) => (
              <Row className="items-center gap-2">
                <SiteLink href={foldPath(fold)}>{fold.name}</SiteLink>
                <div />
                <div className="text-sm text-gray-500">12 followers</div>
                <div className="text-gray-500">•</div>
                <Row>
                  <div className="text-sm text-gray-500 mr-1">Curated by</div>
                  <UserLink
                    className="text-sm text-neutral"
                    name={curators[index].name}
                    username={curators[index].username}
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

function CreateFoldForm() {
  const [name, setName] = useState('')
  const [tags, setTags] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  return (
    <form>
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
      <TagsList tags={parseWordsAsTags(tags)} />
    </form>
  )
}
