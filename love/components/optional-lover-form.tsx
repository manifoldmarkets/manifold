import { useState } from 'react'
import { uniq } from 'lodash'
import { Title } from 'web/components/widgets/title'
import { Col } from 'web/components/layout/col'
import clsx from 'clsx'
import { MultiCheckbox } from 'web/components/multi-checkbox'
import { Row } from 'web/components/layout/row'
import { Input } from 'web/components/widgets/input'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { Button } from 'web/components/buttons/button'
import { colClassName, labelClassName } from 'love/pages/signup'
import { uploadImage } from 'web/lib/firebase/storage'
import { Lover } from 'love/hooks/use-lover'
import { useRouter } from 'next/router'
import { CheckCircleIcon } from '@heroicons/react/outline'
import Image from 'next/image'
import { buildArray } from 'common/util/array'
import { updateLover } from 'web/lib/firebase/love/api'
import { Row as rowFor } from 'common/supabase/utils'
import { XIcon } from '@heroicons/react/solid'

export const OptionalLoveUserForm = (props: {
  lover: Lover
  setLoverState: (key: keyof rowFor<'lovers'>, value: any) => void
  butonLabel?: string
}) => {
  const { lover, butonLabel, setLoverState } = props
  const { user } = lover

  const router = useRouter()
  const [heightFeet, setHeightFeet] = useState(0)
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
    if (!lover.pinned_url) setLoverState('pinned_url', urls[0])
    setLoverState('photo_urls', uniq([...(lover.photo_urls ?? []), ...urls]))
    setUploadingImages(false)
  }

  const handleSubmit = async () => {
    const res = await updateLover({
      ...lover,
    }).catch((e) => {
      console.error(e)
      return false
    })
    if (res) {
      console.log('success')
      router.push('/love-questions')
    }
  }

  return (
    <>
      <Title>More about me</Title>
      <Col className={'gap-8'}>
        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>Upload some pics!</label>
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
                      setLoverState(
                        'photo_urls',
                        uniq(buildArray(lover.pinned_url, lover.photo_urls))
                      )
                      setLoverState('pinned_url', url)
                    }}
                  >
                    {isPinned && (
                      <div
                        className={clsx(' absolute left-0 top-0 rounded-full')}
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
                          setLoverState('pinned_url', newUrls[0] ?? '')
                        setLoverState('photo_urls', newUrls)
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
          <label className={clsx(labelClassName)}>
            Website or date doc link
          </label>
          <Input
            type="text"
            onChange={(e) => setLoverState('website', e.target.value)}
            className={'w-full sm:w-96'}
            value={lover['website'] ?? undefined}
          />
        </Col>
        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>Twitter</label>
          <Input
            type="text"
            onChange={(e) => setLoverState('twitter', e.target.value)}
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
              'E/acc': 'e/acc',
              'Pause AI': 'pause ai',
              Other: 'other',
            }}
            selected={lover['political_beliefs'] ?? []}
            onChange={(selected) =>
              setLoverState('political_beliefs', selected)
            }
          />
        </Col>

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>Current number of kids</label>
          <Input
            type="number"
            onChange={(e) => setLoverState('has_kids', Number(e.target.value))}
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
            setChoice={(c) => setLoverState('is_smoker', c)}
          />
        </Col>

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>
            Alcoholic beverages consumed per month
          </label>
          <Input
            type="number"
            onChange={(e) =>
              setLoverState('drinks_per_month', Number(e.target.value))
            }
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
                onChange={(e) => setHeightFeet(Number(e.target.value))}
                className={'w-16'}
              />
            </Col>
            <Col>
              <span>Inches</span>
              <Input
                type="number"
                onChange={(e) =>
                  setLoverState(
                    'height_in_inches',
                    Number(e.target.value) + heightFeet * 12
                  )
                }
                className={'w-16'}
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
            choices={{
              African: 'african',
              Asian: 'asian',
              Caucasian: 'caucasian',
              Hispanic: 'hispanic',
              'Middle Eastern': 'middle_eastern',
              'Native American': 'native_american',
              'Pacific Islander': 'pacific_islander',
              Other: 'other',
            }}
            selected={lover['ethnicity'] ?? []}
            onChange={(selected) => setLoverState('ethnicity', selected)}
          />
        </Col>

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>
            Highest education level
          </label>
          <ChoicesToggleGroup
            currentChoice={lover['education_level'] ?? ''}
            choicesMap={{
              'High School': 'high-school',
              Bachelors: 'bachelors',
              Masters: 'masters',
              Doctorate: 'doctorate',
            }}
            setChoice={(c) => setLoverState('education_level', c)}
          />
        </Col>
        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>University</label>
          <Input
            type="text"
            onChange={(e) => setLoverState('university', e.target.value)}
            className={'w-52'}
            value={lover['university'] ?? undefined}
          />
        </Col>
        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>Company</label>
          <Input
            type="text"
            onChange={(e) => setLoverState('company', e.target.value)}
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
            onChange={(e) => setLoverState('occupation_title', e.target.value)}
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
