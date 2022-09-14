import Masonry from 'react-masonry-css'
import { filterDefined } from 'common/util/array'
import { keyBy, uniqBy } from 'lodash'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/page'
import { Title } from 'web/components/title'
import { useTrendingContracts } from 'web/hooks/use-contracts'
import { useTopFollowedGroups } from 'web/hooks/use-group'
import { useUser } from 'web/hooks/use-user'
import { GroupCard } from '../groups'

export default function Explore() {
  const user = useUser()

  const topGroups = useTopFollowedGroups(200)
  const groupsById = keyBy(topGroups, 'id')

  const trendingContracts = useTrendingContracts(200)

  const groupLinks = uniqBy(
    (trendingContracts ?? []).map((c) => c.groupLinks ?? []).flat(),
    (link) => link.groupId
  )
  const groups = filterDefined(
    groupLinks.map((link) => groupsById[link.groupId])
  ).filter((group) => group.totalMembers >= 3)

  return (
    <Page>
      <Col className="pm:mx-10 gap-4 px-4 pb-12 xl:w-[115%]">
        <Row className={'w-full items-center justify-between'}>
          <Title className="!mb-0" text="Explore" />
        </Row>

        <Masonry
          // Show only 1 column on tailwind's md breakpoint (768px)
          breakpointCols={{ default: 3, 1200: 2, 570: 1 }}
          className="-ml-4 flex w-auto self-center"
          columnClassName="pl-4 bg-clip-padding"
        >
          {groups.map((g) => (
            <GroupCard
              className="mb-4 !min-w-[250px]"
              group={g}
              creator={null}
              user={user}
              isMember={false}
            />
          ))}
        </Masonry>
      </Col>
    </Page>
  )
}
