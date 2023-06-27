import {
  DISCORD_BOT_INVITE_LINK,
  DISCORD_INVITE_LINK,
} from 'common/envs/constants'
import React from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/widgets/title'

export default function DiscordBot() {
  return (
    <Page>
      <SEO
        title={'Manifold Discord Bot'}
        description={'Add the Manifold Discord Bot to your server!'}
      />
      <Col className={'w-full items-center '}>
        <Col className={'bg-canvas-0 gap-3 p-4'}>
          <Title>Our Discord Bot</Title>
          <Col className={'mx-4 gap-2'}>
            <li>
              Want an easy way to introduce your friends to prediction markets?
            </li>
            <li>Want to put skin in the game instead of just arguing?</li>
            <li>
              Got a discord server full of degens and want to make some money
              off of them?
            </li>
            <Row className={'w-full justify-center'}>
              <Button
                className={'mt-2'}
                size={'lg'}
                color={'gradient-pink'}
                onClick={() => {
                  window.open(DISCORD_BOT_INVITE_LINK)
                }}
              >
                Add our bot to your server!
              </Button>
            </Row>
          </Col>
          <Row className={'text-primary-700 text-xl'}>What is it?</Row>
          <span className={'mx-4'}>
            The Manifold Discord Bot allows you to trade, search, and
            create prediction markets right from your discord server. It
            supports trading via Zoomer-friendly emoji reactions! This is how it
            looks:
          </span>
          <Row className={'w-full justify-center'}>
            <img
              src={'/discord-ss.png'}
              className={'image m-2 rounded-lg object-cover'}
            />
          </Row>
          <Row className={'text-primary-700 text-xl'}>How can I get it?</Row>
          <span className={'mx-4'}>
            Easy! Just click the button below and choose your server from the
            list. You'll need to have the "Manage Server" permission to add the
            bot.
          </span>
          <Row className={'w-full justify-center'}>
            <Button
              color={'gradient-pink'}
              size={'lg'}
              onClick={() => {
                window.open(DISCORD_BOT_INVITE_LINK)
              }}
            >
              Add our bot to your server!
            </Button>
          </Row>
          <Row className={'text-primary-700 text-xl'}>Questions?</Row>
          <span className={'mx-4'}>
            Come by our{' '}
            <a
              href={DISCORD_INVITE_LINK}
              target={'_blank'}
              className={'text-primary-500'}
            >
              Discord!
            </a>{' '}
          </span>
        </Col>
      </Col>
    </Page>
  )
}
