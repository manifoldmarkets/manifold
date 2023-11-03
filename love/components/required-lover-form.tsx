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
import dayjs from 'dayjs'
import { Checkbox } from 'web/components/widgets/checkbox'
import { range, uniq } from 'lodash'
import { Select } from 'web/components/widgets/select'
import { CitySearchBox, City } from './search-location'
import { uploadImage } from 'web/lib/firebase/storage'
import { buildArray } from 'common/util/array'
import { CheckCircleIcon } from '@heroicons/react/outline'
import { XIcon } from '@heroicons/react/solid'
import Image from 'next/image'

export const initialRequiredState = {
  birthdate: dayjs().subtract(18, 'year').format('YYYY-MM-DD'),
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
  onSubmit?: () => void
  loverCreatedAlready?: boolean
}) => {
  const { user, onSubmit, loverCreatedAlready, setLover, lover } = props
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

  const [uploadingImages, setUploadingImages] = useState(false)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    setUploadingImages(true)

    // Convert files to an array and take only the first 6 files
    const selectedFiles = Array.from(files).slice(0, 6)

    const urls = await Promise.all(
      selectedFiles.map((f) => uploadImage(user.username, f, 'love-images'))
    ).catch((e) => {
      console.error(e)
      return []
    })
    if (!lover.pinned_url) setLover('pinned_url', urls[0])
    setLover('photo_urls', uniq([...(lover.photo_urls ?? []), ...urls]))
    setUploadingImages(false)
  }

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
                lover={lover}
              />
            </Col>

            <Col className={clsx(colClassName)}>
              <label className={clsx(labelClassName)}>Birthdate</label>
              <Row className={'gap-2'}>
                <Col className={clsx(colClassName)}>
                  <label className={clsx('text-base font-semibold')}>
                    Month
                  </label>
                  <Select
                    value={dayjs(lover['birthdate']).format('MMMM')}
                    onChange={(e) => {
                      const birthDate = dayjs(lover['birthdate'])
                      const monthNumber = MONTHS.indexOf(e.target.value) + 1
                      setLover(
                        'birthdate',
                        dayjs(
                          `${birthDate.year()}-${monthNumber}-${birthDate.date()}`
                        ).format('YYYY-MM-DD')
                      )
                    }}
                    className={'border-ink-300 w-32 rounded-md'}
                  >
                    {MONTHS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </Col>
                <Col className={clsx(colClassName)}>
                  <label className={clsx('text-base font-semibold')}>Day</label>
                  <Select
                    value={dayjs(lover['birthdate']).date()}
                    onChange={(e) => {
                      const birthDate = dayjs(lover['birthdate'])
                      setLover(
                        'birthdate',
                        dayjs(
                          `${birthDate.year()}-${birthDate.month() + 1}-${
                            e.target.value
                          }`
                        ).format('YYYY-MM-DD')
                      )
                    }}
                    className={'w-18 border-ink-300 rounded-md'}
                  >
                    {range(1, 32).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </Col>
                <Col className={clsx(colClassName)}>
                  <label className={clsx('text-base font-semibold')}>
                    Year
                  </label>
                  <Select
                    value={dayjs(lover['birthdate']).year()}
                    onChange={(e) => {
                      const birthDate = dayjs(lover['birthdate'])
                      const newDateStr = `${e.target.value}-${
                        birthDate.month() + 1
                      }-${birthDate.date()}`
                      setLover(
                        'birthdate',
                        dayjs(newDateStr).format('YYYY-MM-DD')
                      )
                    }}
                    className={'border-ink-300 w-24 rounded-md'}
                  >
                    {range(
                      dayjs().subtract(18, 'year').year(),
                      dayjs().subtract(100, 'year').year()
                    ).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </Col>
              </Row>
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
              <Checkbox
                className={'mt-7'}
                label={'Trans'}
                toggle={setTrans}
                checked={trans ?? false}
                disabled={lover['gender'] === 'non-binary'}
              />
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
              <label className={clsx(labelClassName)}>
                Upload at least one photo
              </label>
              <input
                type="file"
                onChange={handleFileChange}
                multiple // Allows multiple files to be selected
                className={'w-64'}
                disabled={uploadingImages}
              />
              <Row className="flex-wrap gap-2">
                {uniq(buildArray(lover.pinned_url, lover.photo_urls))?.map(
                  (url, index) => {
                    const isPinned = url === lover.pinned_url
                    return (
                      <div
                        key={index}
                        className={clsx(
                          'relative cursor-pointer rounded-md border-2 p-2',
                          isPinned ? 'border-teal-500' : 'border-canvas-100',
                          'hover:border-teal-900'
                        )}
                        onClick={() => {
                          if (isPinned) return
                          setLover(
                            'photo_urls',
                            uniq(buildArray(lover.pinned_url, lover.photo_urls))
                          )
                          setLover('pinned_url', url)
                        }}
                      >
                        {isPinned && (
                          <div
                            className={clsx(
                              ' absolute left-0 top-0 rounded-full'
                            )}
                          >
                            <CheckCircleIcon
                              className={
                                ' bg-canvas-0 h-6 w-6 rounded-full text-teal-500'
                              }
                            />
                          </div>
                        )}
                        <Button
                          onClick={(e) => {
                            e.stopPropagation()
                            const newUrls = (lover.photo_urls ?? []).filter(
                              (u) => u !== url
                            )
                            if (isPinned)
                              setLover('pinned_url', newUrls[0] ?? '')
                            setLover('photo_urls', newUrls)
                          }}
                          color={'gray-outline'}
                          size={'2xs'}
                          className={clsx(
                            'bg-canvas-0 absolute right-0 top-0 !rounded-full !px-1 py-1'
                          )}
                        >
                          <XIcon className={'h-4 w-4'} />
                        </Button>
                        <Image
                          src={url}
                          width={80}
                          height={80}
                          alt={`preview ${index}`}
                          className="h-20 w-20 object-cover"
                        />
                      </div>
                    )
                  }
                )}
              </Row>
              {lover['photo_urls']?.length ? (
                <span className={'text-ink-500 text-xs italic'}>
                  The highlighted image is your profile picture
                </span>
              ) : null}
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

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
