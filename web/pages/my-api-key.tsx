import React, { useEffect } from 'react'
import { Button } from 'web/components/buttons/button'
import { CopyLinkButton } from 'web/components/buttons/copy-link-button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Title } from 'web/components/widgets/title'
import { usePrivateUser } from 'web/hooks/use-user'
import { generateNewApiKey } from 'web/lib/api/api-key'
import { firebaseLogin } from 'web/lib/firebase/users'

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
            1. Copy your API key:
            <Row>
              <CopyLinkButton url={apiKey} displayUrl={apiKey} />
            </Row>
            2. Respond to our Discord bot with your key.
          </Col>
        ) : (
          <LoadingIndicator />
        )}
      </Col>
    </Page>
  )
}
