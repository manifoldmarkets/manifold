import React, { useEffect } from 'react'
import toast from 'react-hot-toast'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Title } from 'web/components/widgets/title'
import { usePrivateUser } from 'web/hooks/use-user'
import { generateNewApiKey } from 'web/lib/api/api-key'
import { firebaseLogin } from 'web/lib/firebase/users'
import { copyToClipboard } from 'web/lib/util/copy'

export default function MyApiKey() {
  const privateUser = usePrivateUser()
  const [apiKey, setApiKey] = React.useState<string | undefined>(undefined)
  useEffect(() => {
    if (!privateUser) return
    if (privateUser.apiKey) setApiKey(privateUser.apiKey)
    else generateNewApiKey(privateUser.id).then(setApiKey)
  }, [privateUser])

  if (privateUser === undefined) {
    return <LoadingIndicator />
  }
  // make a page that shows your api key and a copy button
  return (
    <Page>
      <Col className={'p-2'}>
        <Title>Sign in to Discord Bot</Title>
        {!privateUser ? (
          <Button color={'gradient'} onClick={firebaseLogin}>
            Sign in
          </Button>
        ) : apiKey ? (
          <Col className="gap-4 p-1 text-xl">
            <Row className={'items-center gap-2'}>
              1.
              <Button
                color={'green'}
                onClick={() => {
                  copyToClipboard(apiKey)
                  toast.success('Link copied!')
                }}
              >
                Copy API key
              </Button>
            </Row>
            2. Paste your key in the direct message with our Discord bot.
            <Row className={'text-xs text-gray-600'}>
              Your API key gives access to your account - only share with
              bots/people that you trust!
            </Row>
          </Col>
        ) : (
          <LoadingIndicator />
        )}
      </Col>
    </Page>
  )
}
