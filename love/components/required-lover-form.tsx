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
import { Row as rowFor } from 'common/supabase/utils'
import { Checkbox } from 'web/components/widgets/checkbox'
import { range } from 'lodash'
import { Select } from 'web/components/widgets/select'
import { CitySearchBox, City, loverToCity, CityRow } from './search-location'
import { AddPhotosWidget } from './widgets/add-photos'

export const initialRequiredState = {
  age: 0,
  gender: '',
  pref_gender: [],
  pref_age_min: 18,
  pref_age_max: 100,
  pref_relation_styles: [],
  wants_kids_strength: 2,
  looking_for_matches: true,
  messaging_status: 'open',
  visibility: 'public',
  city: '',
  pinned_url: '',
  photo_urls: [],
}

const requiredKeys = Object.keys(
  initialRequiredState
) as (keyof typeof initialRequiredState)[]

export const RequiredLoveUserForm = (props: {
  user: User
  lover: rowFor<'lovers'>
  setLover: (key: keyof rowFor<'lovers'>, value: any) => void
  isSubmitting: boolean
  onSubmit?: () => void
  loverCreatedAlready?: boolean
}) => {
  const { user, onSubmit, loverCreatedAlready, setLover, lover, isSubmitting } =
    props
  const [trans, setTrans] = useState<boolean | undefined>(
    lover['gender'].includes('trans')
  )
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
    (!lover.looking_for_matches ||
      requiredKeys
        .map((k) => lover[k])
        .every((v) =>
          typeof v == 'string'
            ? v !== ''
            : Array.isArray(v)
            ? v.length > 0
            : v !== undefined
        )) &&
    !loadingUsername &&
    !loadingName

  function setLoverCity(inputCity: City | undefined) {
    if (!inputCity) {
      setLover('geodb_city_id', undefined)
      setLover('city', '')
      setLover('region_code', undefined)
      setLover('country', undefined)
      setLover('city_latitude', undefined)
      setLover('city_longitude', undefined)
    } else {
      const {
        geodb_city_id,
        city,
        region_code,
        country,
        city_latitude,
        city_longitude,
      } = inputCity
      setLover('geodb_city_id', geodb_city_id)
      setLover('city', city)
      setLover('region_code', region_code)
      setLover('country', country)
      setLover('city_latitude', city_latitude)
      setLover('city_longitude', city_longitude)
    }
  }

  useEffect(() => {
    const currentState = lover['gender']
    if (currentState === 'non-binary') {
      setTrans(undefined)
    } else if (trans && !currentState.includes('trans-')) {
      setLover('gender', 'trans-' + currentState.replace('trans-', ''))
    } else if (!trans && currentState.includes('trans-')) {
      setLover('gender', currentState.replace('trans-', ''))
    }
  }, [trans, lover['gender']])

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
            currentChoice={lover.looking_for_matches}
            choicesMap={{
              Yes: true,
              No: false,
            }}
            setChoice={(c) => setLover('looking_for_matches', c)}
          />
        </Col>
        {(lover.looking_for_matches || loverCreatedAlready) && (
          <>
            <Col className={clsx(colClassName)}>
              <label className={clsx(labelClassName)}>Your location</label>
              <CitySearchBox
                onCitySelected={(city: City | undefined) => {
                  setLoverCity(city)
                }}
                selected={!!lover.city}
                selectedNode={
                  <Row className="border-primary-500 w-full justify-between rounded border px-4 py-2">
                    <CityRow city={loverToCity(lover)} />
                    <button
                      className="text-ink-700 hover:text-primary-700 text-sm underline"
                      onClick={() => {
                        setLoverCity(undefined)
                      }}
                    >
                      Change
                    </button>
                  </Row>
                }
              />
            </Col>

            <Col className={clsx(colClassName)}>
              <label className={clsx(labelClassName)}>Age</label>
              <Input
                type="number"
                placeholder="Age"
                value={lover['age'] > 0 ? lover['age'] : undefined}
                min={18}
                max={100}
                onChange={(e) => setLover('age', Number(e.target.value))}
              />
            </Col>

            <Row className={'items-center gap-2'}>
              <Col className={'gap-1'}>
                <label className={clsx(labelClassName)}>Gender</label>
                <ChoicesToggleGroup
                  currentChoice={lover['gender'].replace('trans-', '')}
                  choicesMap={{
                    Woman: 'female',
                    Man: 'male',
                    'Non-binary': 'non-binary',
                  }}
                  setChoice={(c) => setLover('gender', c)}
                />
              </Col>
              {lover.gender !== 'non-binary' && (
                <Checkbox
                  className={'mt-7'}
                  label={'Trans'}
                  toggle={setTrans}
                  checked={trans ?? false}
                />
              )}
            </Row>

            <Col className={clsx(colClassName)}>
              <label className={clsx(labelClassName)}>Interested in</label>
              <MultiCheckbox
                choices={{
                  Women: 'female',
                  Men: 'male',
                  'Non-binary': 'non-binary',
                  'Trans-women': 'trans-female',
                  'Trans-men': 'trans-male',
                }}
                selected={lover['pref_gender']}
                onChange={(selected) => setLover('pref_gender', selected)}
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
                selected={lover['pref_relation_styles']}
                onChange={(selected) =>
                  setLover('pref_relation_styles', selected)
                }
              />
            </Col>

            <Col className={clsx(colClassName)}>
              <label className={clsx(labelClassName)}>Partner age range</label>
              <Row className={'gap-2'}>
                <Col>
                  <span>Min</span>
                  <Select
                    value={lover['pref_age_min']}
                    onChange={(e) =>
                      setLover('pref_age_min', Number(e.target.value))
                    }
                    className={'w-18 border-ink-300 rounded-md'}
                  >
                    {range(18, 100).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </Col>
                <Col>
                  <span>Max</span>
                  <Select
                    value={lover['pref_age_max']}
                    onChange={(e) =>
                      setLover('pref_age_max', Number(e.target.value))
                    }
                    className={'w-18 border-ink-300 rounded-md'}
                  >
                    {range(18, 100).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
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
                  setLover('wants_kids_strength', choice)
                }}
                currentChoice={lover.wants_kids_strength ?? -1}
              />
            </Col>

            <Col className={clsx(colClassName)}>
              <label className={clsx(labelClassName)}>Photos</label>

              <div className="mb-1">
                A real or stylized photo of you is required.
              </div>

              <AddPhotosWidget
                user={user}
                photo_urls={lover.photo_urls}
                pinned_url={lover.pinned_url}
                setPhotoUrls={(urls) => setLover('photo_urls', urls)}
                setPinnedUrl={(url) => setLover('pinned_url', url)}
              />
            </Col>
          </>
        )}

        {onSubmit && (
          <Row className={'justify-end'}>
            <Button
              disabled={!canContinue || isSubmitting}
              loading={isSubmitting}
              onClick={onSubmit}
            >
              Next
            </Button>
          </Row>
        )}
      </Col>
    </>
  )
}
