import { useEffect, useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Input } from 'web/components/widgets/input'
import { Title } from 'web/components/widgets/title'
import { useRedirectIfSignedIn } from 'web/hooks/use-redirect-if-signed-in'
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth'

export default function TestUser() {
  useRedirectIfSignedIn()
  const [password, setPassword] = useState('')
  const [baseEmail, setBaseEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  useEffect(() => {
    setBaseEmail(
      'manifoldTestNewUser+' +
        Math.random().toString(36).substring(2, 15) +
        '@gmail.com'
    )
  }, [])
  const create = () => {
    setSubmitting(true)
    const auth = getAuth()
    createUserWithEmailAndPassword(auth, baseEmail, password)
      .then((userCredential) => {
        setSubmitting(false)
        console.log('SUCCESS creating firebase user', userCredential)
      })
      .catch((error) => {
        setSubmitting(false)
        const errorCode = error.code
        const errorMessage = error.message
        console.log('ERROR creating firebase user', errorCode, errorMessage)
      })
  }

  return (
    <Col className={'items-center justify-items-center gap-1'}>
      <Title>Test New User Creation</Title>
      <Row className={'text-sm text-gray-600'}>
        Prerequisite: Set TEST_CREATE_USER_KEY to the{' '}
        <a
          className={'mx-1 text-indigo-700'}
          href={
            'https://console.cloud.google.com/security/secret-manager/secret/TEST_CREATE_USER_KEY/versions?project=dev-mantic-markets'
          }
        >
          proper value
        </a>{' '}
        in local storage
      </Row>
      Email
      <Row className={'text-gray-600'}>{baseEmail}</Row>
      Password
      <Row>
        <Input
          type={'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value || '')}
        />
      </Row>
      <Button loading={submitting} className={'mt-2'} onClick={create}>
        Submit
      </Button>
    </Col>
  )
}
