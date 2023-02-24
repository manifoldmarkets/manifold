import { useEffect, useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Title } from 'web/components/widgets/title'
import { useRedirectIfSignedIn } from 'web/hooks/use-redirect-if-signed-in'
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth'
import { randomString } from 'common/util/random'

export default function TestUser() {
  useRedirectIfSignedIn()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  useEffect(() => {
    setEmail('manifoldTestNewUser+' + randomString() + '@gmail.com')
    setPassword(randomString())
  }, [])

  const [submitting, setSubmitting] = useState(false)

  const create = () => {
    setSubmitting(true)
    const auth = getAuth()
    createUserWithEmailAndPassword(auth, email, password)
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
            'https://www.notion.so/manifoldmarkets/Passwords-f460a845ed6d47fc9ea353699adf7c5f?pvs=4#8a11d580b85449a2bba6e400cda8a4c6'
          }
        >
          proper value
        </a>{' '}
        in local storage
      </Row>
      Email
      <Row className={'text-gray-600'}>{email}</Row>
      Password
      <Row className={'text-gray-600'}>{password}</Row>
      <Button loading={submitting} className={'mt-2'} onClick={create}>
        Submit
      </Button>
    </Col>
  )
}
