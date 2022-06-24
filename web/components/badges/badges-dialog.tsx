import React, { useState } from 'react'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import {
  LightningBoltIcon,
  PresentationChartLineIcon,
} from '@heroicons/react/solid'
import { Badge } from './badge'
import { Modal } from '../layout/modal'
import { Title } from '../title'
import { User } from 'web/lib/firebase/users'

export function BadgesDialog(props: { user: User }) {
  const { user } = props
  const [open, setOpen] = useState(false)

  const topCreatorBadge = () => (
    <Badge
      icon={<PresentationChartLineIcon className="h-5 w-5" />}
      label={'#' + user.badges.weeklyCreatorRank}
    />
  )

  const topTraderBadge = () => (
    <Badge
      icon={<LightningBoltIcon className="h-5 w-5" />}
      label={'#' + user.badges.weeklyTraderRank}
    />
  )

  const showTopTraderBadge = user.badges.weeklyTraderRank > 0

  const showTopCreatorBadge = user.badges.weeklyCreatorRank > 0

  return (
    <>
      <Row className="space-x-2">
        <Col>
          <button
            className="margin-left-5 flex items-center"
            onClick={() => setOpen(true)}
          >
            <Row>{showTopCreatorBadge && topCreatorBadge()}</Row>
          </button>
        </Col>
        <Col>
          <button
            className="margin-left-5 flex items-center"
            onClick={() => setOpen(true)}
          >
            <Row>{showTopTraderBadge && topTraderBadge()}</Row>
          </button>
        </Col>
      </Row>
      <Modal open={open} setOpen={setOpen}>
        <Col className="gap-4 rounded bg-white p-6">
          <Title className="!mt-0 !mb-0" text="Badges" />

          <div>{user.name} has the following badges:</div>
          {showTopCreatorBadge && (
            <Row className="justify-start gap-4">
              <Col>{topCreatorBadge()}</Col>
              <Col className="justify-center">
                <span className="align-middle text-sm">
                  Rank in the top creators last week
                </span>
              </Col>
            </Row>
          )}
          {showTopTraderBadge && (
            <Row className="justify-start gap-4">
              <Col>{topTraderBadge()}</Col>
              <Col className="justify-center">
                <span className="align-middle text-sm">
                  Rank in the top bettors last week
                </span>
              </Col>
            </Row>
          )}
          <div />
        </Col>
      </Modal>
    </>
  )
}
