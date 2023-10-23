import { useEffect, useState } from 'react'
import { Title } from 'web/components/widgets/title'
import { Col } from 'web/components/layout/col'
import clsx from 'clsx'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { Input } from 'web/components/widgets/input'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { colClassName, labelClassName } from 'love/pages/signup'
import { MultiCheckbox } from 'web/components/multi-checkbox'
import { User } from 'common/user'
import { RadioToggleGroup } from 'web/components/widgets/radio-toggle-group'
import { MultipleChoiceOptions } from 'common/love/multiple-choice'
import { useEditableUserInfo } from 'web/hooks/use-editable-user-info'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { initialRequiredState } from 'common/love/lover'
import { Row as rowFor } from 'common/supabase/utils'
import dayjs from 'dayjs'
import { Checkbox } from 'web/components/widgets/checkbox'

const requiredKeys = Object.keys(
  initialRequiredState
) as (keyof typeof initialRequiredState)[]

export const RequiredLoveUserForm = (props: {
  user: User
  loverState: rowFor<'lovers'>
  setLoverState: (key: keyof rowFor<'lovers'>, value: any) => void
  onSubmit?: () => void
  loverCreatedAlready?: boolean
}) => {
  const { user, onSubmit, loverCreatedAlready, setLoverState, loverState } =
    props
  const [trans, setTrans] = useState<boolean>()
  const [showCityInput, setShowCityInput] = useState(false)
  const { updateUsername, updateDisplayName, userInfo, updateUserState } =
    useEditableUserInfo(user)

  const {
    name,
    username,
    errorUsername,
    loadingUsername,
    loadingName,
    errorName,
  } = userInfo

  const canContinue =
    (!loverState.looking_for_matches ||
      requiredKeys
        .map((k) => loverState[k])
        .every((v) =>
          typeof v == 'string'
            ? v !== ''
            : Array.isArray(v)
            ? v.length > 0
            : v !== undefined
        )) &&
    !loadingUsername &&
    !loadingName

  useEffect(() => {
    const currentState = loverState['gender']
    if (currentState === 'non-binary') {
      setTrans(undefined)
    } else if (trans && !currentState.includes('trans-')) {
      setLoverState('gender', 'trans-' + currentState.replace('trans-', ''))
    } else if (!trans && currentState.includes('trans-')) {
      setLoverState('gender', currentState.replace('trans-', ''))
    }
  }, [trans, loverState['gender']])

  return (
    <>
      <Title>The Basics</Title>
      <Col className={'gap-8'}>
        <Col>
          <label className={clsx(labelClassName)}>Display name</label>
          <Row className={'items-center gap-2'}>
            <Input
              disabled={loadingName}
              type="text"
              placeholder="Display name"
              value={name}
              onChange={(e) => {
                updateUserState({ name: e.target.value || '' })
              }}
              onBlur={updateDisplayName}
            />
            {loadingName && <LoadingIndicator className={'ml-2'} />}
          </Row>
          {errorName && <span className="text-error text-sm">{errorName}</span>}
        </Col>

        <Col>
          <label className={clsx(labelClassName)}>Username</label>
          <Row className={'items-center gap-2'}>
            <Input
              disabled={loadingUsername}
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => {
                updateUserState({ username: e.target.value || '' })
              }}
              onBlur={updateUsername}
            />
            {loadingUsername && <LoadingIndicator className={'ml-2'} />}
          </Row>
          {errorUsername && (
            <span className="text-error text-sm">{errorUsername}</span>
          )}
        </Col>

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>Looking for matches</label>
          <ChoicesToggleGroup
            currentChoice={loverState.looking_for_matches}
            choicesMap={{
              Yes: true,
              No: false,
            }}
            setChoice={(c) => setLoverState('looking_for_matches', c)}
          />
        </Col>
        {(loverState.looking_for_matches || loverCreatedAlready) && (
          <>
            <Col className={clsx(colClassName)}>
              <label className={clsx(labelClassName)}>Your location</label>
              <ChoicesToggleGroup
                currentChoice={loverState['city']}
                choicesMap={{
                  'San Francisco': 'San Francisco',
                  'New York City': 'New York City',
                  London: 'London',
                  Other: 'Other',
                }}
                setChoice={(c) => {
                  if (c === 'Other') {
                    setLoverState('city', '')
                    setShowCityInput(true)
                  } else {
                    setShowCityInput(false)
                    setLoverState('city', c)
                  }
                }}
              />
              {showCityInput && (
                <Input
                  type="text"
                  value={loverState['city']}
                  onChange={(e) => setLoverState('city', e.target.value)}
                  className={'w-56'}
                  placeholder={'e.g. DC'}
                />
              )}
            </Col>

            <Col className={clsx(colClassName)}>
              <label className={clsx(labelClassName)}>Date of birth</label>
              <Input
                type="date"
                onChange={(e) =>
                  setLoverState(
                    'birthdate',
                    dayjs(new Date(e.target.value).toISOString()).format(
                      'YYYY-MM-DD'
                    )
                  )
                }
                className={'w-40'}
                value={loverState['birthdate']}
              />
            </Col>

            <Row className={'items-center gap-2'}>
              <Col className={'gap-1'}>
                <label className={clsx(labelClassName)}>Gender</label>
                <ChoicesToggleGroup
                  currentChoice={loverState['gender'].replace('trans-', '')}
                  choicesMap={{
                    Male: 'male',
                    Female: 'female',
                    'Non-binary': 'non-binary',
                  }}
                  setChoice={(c) => setLoverState('gender', c)}
                />
              </Col>
              <Checkbox
                className={'mt-7'}
                label={'Trans'}
                toggle={setTrans}
                checked={trans ?? false}
                disabled={loverState['gender'] === 'non-binary'}
              />
            </Row>

            <Col className={clsx(colClassName)}>
              <label className={clsx(labelClassName)}>Interested in</label>
              <MultiCheckbox
                choices={{
                  Male: 'male',
                  Female: 'female',
                  'Non-binary': 'non-binary',
                  'Trans-female': 'trans-female',
                  'Trans-male': 'trans-male',
                }}
                selected={loverState['pref_gender']}
                onChange={(selected) => setLoverState('pref_gender', selected)}
              />
            </Col>

            <Col className={clsx(colClassName)}>
              <label className={clsx(labelClassName)}>Relationship style</label>
              <MultiCheckbox
                choices={{
                  Monogamous: 'mono',
                  Polyamorous: 'poly',
                  'Open Relationship': 'open',
                  Other: 'other',
                }}
                selected={loverState['pref_relation_styles']}
                onChange={(selected) =>
                  setLoverState('pref_relation_styles', selected)
                }
              />
            </Col>

            <Col className={clsx(colClassName)}>
              <label className={clsx(labelClassName)}>
                Minimum and maximum age of partner
              </label>
              <Row className={'gap-2'}>
                <Col>
                  <span>Min</span>
                  <Input
                    type="number"
                    onChange={(e) =>
                      setLoverState('pref_age_min', Number(e.target.value))
                    }
                    className={'w-20'}
                    min={18}
                    max={999}
                    value={loverState['pref_age_min']}
                  />
                </Col>
                <Col>
                  <span>Max</span>
                  <Input
                    type="number"
                    onChange={(e) =>
                      setLoverState('pref_age_max', Number(e.target.value))
                    }
                    className={'w-20'}
                    min={loverState['pref_age_min']}
                    max={1000}
                    value={loverState['pref_age_max']}
                  />
                </Col>
              </Row>
            </Col>

            <Col className={clsx(colClassName)}>
              <label className={clsx(labelClassName)}>
                You want to have kids
              </label>
              <RadioToggleGroup
                className={'w-44'}
                choicesMap={MultipleChoiceOptions}
                setChoice={(choice) => {
                  setLoverState('wants_kids_strength', choice)
                }}
                currentChoice={loverState.wants_kids_strength ?? -1}
              />
            </Col>
          </>
        )}

        {onSubmit && (
          <Row className={'justify-end'}>
            <Button disabled={!canContinue} onClick={onSubmit}>
              Next
            </Button>
          </Row>
        )}
      </Col>
    </>
  )
}
