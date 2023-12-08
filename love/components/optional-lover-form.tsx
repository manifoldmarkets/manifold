import { useState } from 'react'
import { Title } from 'web/components/widgets/title'
import { Col } from 'web/components/layout/col'
import clsx from 'clsx'
import { MultiCheckbox } from 'web/components/multi-checkbox'
import { Row } from 'web/components/layout/row'
import { Input } from 'web/components/widgets/input'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { Button } from 'web/components/buttons/button'
import { colClassName, labelClassName } from 'love/pages/signup'
import { useRouter } from 'next/router'
import { updateLover } from 'web/lib/firebase/love/api'
import { Row as rowFor } from 'common/supabase/utils'
import { User } from 'common/user'
import { track } from 'web/lib/service/analytics'
import { Races } from './race'
import { Carousel } from 'web/components/widgets/carousel'
import { useCallReferUser } from 'web/hooks/use-call-refer-user'

export const OptionalLoveUserForm = (props: {
  lover: rowFor<'lovers'>
  setLover: (key: keyof rowFor<'lovers'>, value: any) => void
  user: User
  buttonLabel?: string
  fromSignup?: boolean
}) => {
  const { lover, user, buttonLabel, setLover, fromSignup } = props

  const router = useRouter()
  const [heightFeet, setHeightFeet] = useState<number | undefined>(
    Math.floor((lover['height_in_inches'] ?? 0) / 12)
  )
  const [heightInches, setHeightInches] = useState<number | undefined>(
    Math.floor((lover['height_in_inches'] ?? 0) % 12)
  )
  useCallReferUser()

  const handleSubmit = async () => {
    const res = await updateLover({ ...lover }).catch((e) => {
      console.error(e)
      return false
    })
    if (res) {
      console.log('success')
      track('submit love optional profile')
      if (user)
        router.push(`/${user.username}${fromSignup ? '?fromSignup=true' : ''}`)
      else router.push('/')
    }
  }
  return (
    <>
      <Title>More about me</Title>
      <div className="text-ink-500 mb-6 text-lg">Optional information</div>

      <Col className={'gap-8'}>
        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>
            Website or date doc link
          </label>
          <Input
            type="text"
            onChange={(e) => setLover('website', e.target.value)}
            className={'w-full sm:w-96'}
            value={lover['website'] ?? undefined}
          />
        </Col>
        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>Twitter</label>
          <Input
            type="text"
            onChange={(e) => setLover('twitter', e.target.value)}
            className={'w-full sm:w-96'}
            value={lover['twitter'] ?? undefined}
          />
        </Col>

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>Political beliefs</label>
          <MultiCheckbox
            choices={{
              Liberal: 'liberal',
              Moderate: 'moderate',
              Conservative: 'conservative',
              Socialist: 'socialist',
              Libertarian: 'libertarian',
              'e/acc': 'e/acc',
              'Pause AI': 'pause ai',
              Other: 'other',
            }}
            selected={lover['political_beliefs'] ?? []}
            onChange={(selected) => setLover('political_beliefs', selected)}
          />
        </Col>

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>Religious beliefs</label>
          <Input
            type="text"
            onChange={(e) => setLover('religious_beliefs', e.target.value)}
            className={'w-full sm:w-96'}
            value={lover['religious_beliefs'] ?? undefined}
          />
        </Col>

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>Current number of kids</label>
          <Input
            type="number"
            onChange={(e) => {
              const value =
                e.target.value === '' ? null : Number(e.target.value)
              setLover('has_kids', value)
            }}
            className={'w-20'}
            min={0}
            value={lover['has_kids'] ?? undefined}
          />
        </Col>

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>Do you smoke?</label>
          <ChoicesToggleGroup
            currentChoice={lover['is_smoker'] ?? -1}
            choicesMap={{
              Yes: true,
              No: false,
            }}
            setChoice={(c) => setLover('is_smoker', c)}
          />
        </Col>

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>
            Alcoholic beverages consumed per month
          </label>
          <Input
            type="number"
            onChange={(e) => {
              const value =
                e.target.value === '' ? null : Number(e.target.value)
              setLover('drinks_per_month', value)
            }}
            className={'w-20'}
            min={0}
            value={lover['drinks_per_month'] ?? undefined}
          />
        </Col>

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>Height</label>
          <Row className={'gap-2'}>
            <Col>
              <span>Feet</span>
              <Input
                type="number"
                onChange={(e) => {
                  if (e.target.value === '') {
                    setHeightFeet(undefined)
                  } else {
                    setHeightFeet(Number(e.target.value))
                    const heightInInches =
                      Number(e.target.value) * 12 + (heightInches ?? 0)
                    setLover('height_in_inches', heightInInches)
                  }
                }}
                className={'w-16'}
                value={heightFeet ?? ''}
              />
            </Col>
            <Col>
              <span>Inches</span>
              <Input
                type="number"
                onChange={(e) => {
                  if (e.target.value === '') {
                    setHeightInches(undefined)
                  } else {
                    setHeightInches(Number(e.target.value))
                    const heightInInches =
                      Number(e.target.value) + 12 * (heightFeet ?? 0)
                    setLover('height_in_inches', heightInInches)
                  }
                }}
                className={'w-16'}
                value={heightInches ?? ''}
              />
            </Col>
          </Row>
        </Col>

        {/* <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>Birthplace</label>
          <Input
            type="text"
            onChange={(e) => setLoverState('born_in_location', e.target.value)}
            className={'w-52'}
            value={lover['born_in_location'] ?? undefined}
          />
        </Col> */}

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>Ethnicity/origin</label>
          <MultiCheckbox
            choices={Races}
            selected={lover['ethnicity'] ?? []}
            onChange={(selected) => setLover('ethnicity', selected)}
          />
        </Col>

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>
            Highest completed education level
          </label>
          <Carousel className="max-w-full">
            <ChoicesToggleGroup
              currentChoice={lover['education_level'] ?? ''}
              choicesMap={{
                None: 'none',
                'High school': 'high-school',
                'Some college': 'some-college',
                Bachelors: 'bachelors',
                Masters: 'masters',
                PhD: 'doctorate',
              }}
              setChoice={(c) => setLover('education_level', c)}
            />
          </Carousel>
        </Col>
        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>University</label>
          <Input
            type="text"
            onChange={(e) => setLover('university', e.target.value)}
            className={'w-52'}
            value={lover['university'] ?? undefined}
          />
        </Col>
        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>Company</label>
          <Input
            type="text"
            onChange={(e) => setLover('company', e.target.value)}
            className={'w-52'}
            value={lover['company'] ?? undefined}
          />
        </Col>

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>
            Job title {lover['company'] ? 'at ' + lover['company'] : ''}
          </label>
          <Input
            type="text"
            onChange={(e) => setLover('occupation_title', e.target.value)}
            className={'w-52'}
            value={lover['occupation_title'] ?? undefined}
          />
        </Col>
        <Row className={'justify-end'}>
          <Button onClick={handleSubmit}>{buttonLabel ?? 'Next'}</Button>
        </Row>
      </Col>
    </>
  )
}
