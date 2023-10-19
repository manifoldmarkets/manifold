import { useState } from 'react'
import { set } from 'lodash'
import { createLover } from 'web/lib/firebase/api'
import { Title } from 'web/components/widgets/title'
import { Col } from 'web/components/layout/col'
import clsx from 'clsx'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { Input } from 'web/components/widgets/input'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { colClassName, labelClassName } from 'love/pages/signup'
import { MultiCheckbox } from 'web/components/multi-checkbox'
import { Lover } from 'love/hooks/use-lover'
import { User } from 'common/user'
import { RadioToggleGroup } from 'web/components/widgets/radio-toggle-group'
import { MultipleChoiceOptions } from 'common/love/multiple-choice'
import { useEditableUserInfo } from 'web/hooks/use-editable-user-info'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'

export const RequiredLoveUserForm = (props: {
  user: User
  onSuccess: (lover: Lover) => void
}) => {
  const { user, onSuccess } = props
  const [formState, setFormState] = useState({
    birthdate: '',
    city: '',
    gender: '',
    pref_gender: [],
    pref_age_min: 18,
    pref_age_max: 100,
    pref_relation_styles: [],
    is_smoker: false,
    drinks_per_month: 0,
    is_vegetarian_or_vegan: false,
    has_kids: 0,
    wants_kids_strength: 2,
  })
  const [showCityInput, setShowCityInput] = useState(false)

  const canContinue = Object.values(formState).every((v) =>
    typeof v == 'string'
      ? v !== ''
      : Array.isArray(v)
      ? v.length > 0
      : v !== undefined
  )

  const handleChange = (key: keyof typeof formState, value: any) => {
    setFormState((prevState) => set({ ...prevState }, key, value))
  }

  const handleSubmit = async () => {
    // Do something with the form state, such as sending it to an API
    const res = await createLover({
      ...formState,
    }).catch((e) => {
      console.error(e)
      return null
    })
    if (res && res.lover) {
      onSuccess({ ...res.lover, user } as Lover)
    }
  }
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
  return (
    <>
      <Title>Required questions</Title>
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
          </Row>
          {loadingName && (
            <Row className={'mt-2 items-center gap-4'}>
              <LoadingIndicator />
            </Row>
          )}
          {errorName && <span className="text-error text-sm">{errorName}</span>}
        </Col>

        <Col>
          <label className={clsx(labelClassName)}>Username</label>
          <Row>
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
          </Row>
          {loadingUsername && (
            <Row className={'mt-2 items-center gap-4'}>
              <LoadingIndicator />
            </Row>
          )}
          {errorUsername && (
            <span className="text-error text-sm">{errorUsername}</span>
          )}
        </Col>

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>Your location</label>
          <ChoicesToggleGroup
            currentChoice={formState['city']}
            choicesMap={{
              'San Francisco': 'San Francisco',
              'New York City': 'New York City',
              London: 'London',
              Other: 'Other',
            }}
            setChoice={(c) => {
              if (c === 'Other') {
                handleChange('city', '')
                setShowCityInput(true)
              } else {
                setShowCityInput(false)
                handleChange('city', c)
              }
            }}
          />
          {showCityInput && (
            <Input
              type="text"
              value={formState['city']}
              onChange={(e) => handleChange('city', e.target.value)}
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
              handleChange('birthdate', new Date(e.target.value).toISOString())
            }
            className={'w-40'}
          />
        </Col>

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>Gender</label>
          <ChoicesToggleGroup
            currentChoice={formState['gender']}
            choicesMap={{
              Male: 'male',
              Female: 'female',
              'Non-binary': 'non-binary',
              'Trans-female': 'trans-female',
              'Trans-male': 'trans-male',
              Other: 'other',
            }}
            setChoice={(c) => handleChange('gender', c)}
          />
        </Col>

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>Interested in</label>
          <MultiCheckbox
            choices={{
              Male: 'male',
              Female: 'female',
              'Non-binary': 'non-binary',
              'Trans-female': 'trans-female',
              'Trans-male': 'trans-male',
              Other: 'other',
            }}
            selected={formState['pref_gender']}
            onChange={(selected) => handleChange('pref_gender', selected)}
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
            selected={formState['pref_relation_styles']}
            onChange={(selected) =>
              handleChange('pref_relation_styles', selected)
            }
          />
        </Col>

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>Do you smoke?</label>
          <ChoicesToggleGroup
            currentChoice={formState['is_smoker']}
            choicesMap={{
              Yes: true,
              No: false,
            }}
            setChoice={(c) => handleChange('is_smoker', c)}
          />
        </Col>

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>
            Alcoholic beverages consumed per month
          </label>
          <Input
            type="number"
            onChange={(e) =>
              handleChange('drinks_per_month', Number(e.target.value))
            }
            className={'w-20'}
            min={0}
            value={formState['drinks_per_month']}
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
                  handleChange('pref_age_min', Number(e.target.value))
                }
                className={'w-20'}
                min={18}
                max={999}
                value={formState['pref_age_min']}
              />
            </Col>
            <Col>
              <span>Max</span>
              <Input
                type="number"
                onChange={(e) =>
                  handleChange('pref_age_max', Number(e.target.value))
                }
                className={'w-20'}
                min={formState['pref_age_min']}
                max={1000}
                value={formState['pref_age_max']}
              />
            </Col>
          </Row>
        </Col>

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>Current number of kids</label>
          <Input
            type="number"
            onChange={(e) => handleChange('has_kids', Number(e.target.value))}
            className={'w-20'}
            min={0}
            value={formState['has_kids']}
          />
        </Col>

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>You want to have kids</label>
          <RadioToggleGroup
            className={'w-44'}
            choicesMap={MultipleChoiceOptions}
            setChoice={(choice) => {
              console.log(choice)
              handleChange('wants_kids_strength', choice)
            }}
            currentChoice={formState.wants_kids_strength ?? -1}
          />
        </Col>

        <Row className={'justify-end'}>
          <Button disabled={!canContinue} onClick={handleSubmit}>
            Next
          </Button>
        </Row>
      </Col>
    </>
  )
}
