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
import Image from 'next/image'
import { uploadImage } from 'web/lib/firebase/storage'
import { User } from 'common/user'
import { changeUserInfo } from 'web/lib/firebase/api'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { StackedUserNames } from 'web/components/widgets/user-link'
import { track } from 'web/lib/service/analytics'
import { Races } from './race'
import { Carousel } from 'web/components/widgets/carousel'

export const OptionalLoveUserForm = (props: {
  lover: rowFor<'lovers'>
  setLover: (key: keyof rowFor<'lovers'>, value: any) => void
  user: User
  showAvatar?: boolean
  butonLabel?: string
}) => {
  const { lover, showAvatar, user, butonLabel, setLover } = props

  const router = useRouter()
  const [heightFeet, setHeightFeet] = useState(
    Math.floor((lover['height_in_inches'] ?? 0) / 12)
  )

  const handleSubmit = async () => {
    const res = await updateLover({ ...lover }).catch((e) => {
      console.error(e)
      return false
    })
    if (res) {
      console.log('success')
      track('submit love optional profile')
      if (user) router.push(`/${user.username}`)
      else router.push('/')
    }
  }
  const [uploadingImages, setUploadingImages] = useState(false)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || Array.from(files).length === 0) return
    const selectedFiles = Array.from(files)
    setUploadingImages(true)
    const url = await uploadImage(
      user.username,
      selectedFiles[0],
      'love-images'
    )
    await changeUserInfo({ avatarUrl: url })
    setUploadingImages(false)
  }

  return (
    <>
      <Title>More about me</Title>
      <Col className={'gap-8'}>
        {showAvatar && (
          <Col className={clsx(colClassName)}>
            <label className={clsx(labelClassName)}>
              Change your avatar photo (optional)
            </label>
            <Row>
              <input
                type="file"
                onChange={handleFileChange}
                className={'w-48'}
                disabled={uploadingImages}
              />
              {uploadingImages && <LoadingIndicator />}
            </Row>
            <Row className=" items-center gap-2">
              <Image
                src={user.avatarUrl}
                width={80}
                height={80}
                alt={`avatar photo of ${user.username}`}
                className="h-20 w-20 rounded-full object-cover p-2"
              />
              <StackedUserNames user={user} />
            </Row>
          </Col>
        )}

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
                  setHeightFeet(Number(e.target.value))
                  setLover(
                    'height_in_inches',
                    Number(e.target.value) * 12 +
                      ((lover['height_in_inches'] ?? 0) % 12)
                  )
                }}
                className={'w-16'}
                value={heightFeet}
              />
            </Col>
            <Col>
              <span>Inches</span>
              <Input
                type="number"
                onChange={(e) =>
                  setLover(
                    'height_in_inches',
                    Number(e.target.value) + heightFeet * 12
                  )
                }
                className={'w-16'}
                value={(lover['height_in_inches'] ?? 0) % 12}
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
          <label className={clsx(labelClassName)}>Ethnicity/origin(s)</label>
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
          <Button onClick={handleSubmit}>{butonLabel ?? 'Next'}</Button>
        </Row>
      </Col>
    </>
  )
}
