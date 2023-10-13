// pages/form.tsx
import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Input } from 'web/components/widgets/input'
import { Button } from 'web/components/buttons/button'
import { set } from 'lodash'
import { Title } from 'web/components/widgets/title'
import clsx from 'clsx'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { Checkbox } from 'web/components/widgets/checkbox'
import { Row } from 'web/components/layout/row'
import { createLover, updateLover } from 'web/lib/firebase/api'
import { useLover } from 'web/hooks/use-lover'
export default function SignupPage() {
  const [step, setStep] = useState(0)
  const lover = useLover()
  return (
    <Col className={'p-2'}>
      {step == 0 && !lover ? (
        <RequiredLoveUserForm onSuccess={() => setStep(1)} />
      ) : (
        <OptionalLoveUserForm />
      )}
    </Col>
  )
}
const colClassName = 'items-start gap-2'
const labelClassName = 'font-semibold text-lg'
const RequiredLoveUserForm = (props: { onSuccess: () => void }) => {
  const { onSuccess } = props
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
    wants_kids_strength: 0,
  })

  const handleChange = (key: keyof typeof formState, value: any) => {
    setFormState((prevState) => set({ ...prevState }, key, value))
  }

  const handleSubmit = async () => {
    // Do something with the form state, such as sending it to an API
    const res = await createLover({
      ...formState,
    }).catch((e) => {
      console.error(e)
      return false
    })
    if (res) {
      onSuccess()
    }
  }

  return (
    <>
      <Title>Required questions</Title>
      <Col className={'gap-8'}>
        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>Where do you live?</label>
          <ChoicesToggleGroup
            currentChoice={formState['city']}
            choicesMap={{
              'San Francisco': 'sf',
              'New York City': 'nyc',
              London: 'london',
            }}
            setChoice={(c) => handleChange('city', c)}
          />
        </Col>

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>When were you born?</label>
          <Input
            type="date"
            onChange={(e) =>
              handleChange('birthdate', new Date(e.target.value).toISOString())
            }
            className={'w-40'}
          />
        </Col>

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>What is your gender?</label>
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
          <label className={clsx(labelClassName)}>
            What gender(s) are you interested in?
          </label>
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
          <label className={clsx(labelClassName)}>
            What relationship style(s) are you interested in?
          </label>
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
            How many alcoholic bevvies do you drink per month?
          </label>
          <Input
            type="number"
            onChange={(e) =>
              handleChange('drinks_per_month', Number(e.target.value))
            }
            className={'w-20'}
            min={0}
            placeholder={'0'}
          />
        </Col>

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>
            What is your preferred partner's minimum and maximum age?
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
                placeholder={'18'}
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
                placeholder={'100'}
              />
            </Col>
          </Row>
        </Col>

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>
            How many kids do you currently have?
          </label>
          <Input
            type="number"
            onChange={(e) => handleChange('has_kids', Number(e.target.value))}
            className={'w-20'}
            min={0}
            placeholder={'0'}
          />
        </Col>

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>
            On a scale of 0-5 how strongly do you want to have kids?
          </label>
          <Input
            type="number"
            onChange={(e) =>
              handleChange('wants_kids_strength', Number(e.target.value))
            }
            className={'w-20'}
            min={0}
            max={5}
            placeholder={'3'}
          />
        </Col>

        <div>
          <Button onClick={handleSubmit}>Submit</Button>
        </div>
      </Col>
    </>
  )
}

const OptionalLoveUserForm = () => {
  const [formState, setFormState] = useState({
    ethnicity: [],
    born_in_location: '',
    height_in_inches: 0,
    has_pets: false,
    education_level: '',
    photo_urls: [],
    pinned_url: '',
    religious_belief_strength: 0,
    religious_beliefs: [],
    political_beliefs: [],
  })
  const [heightFeet, setHeightFeet] = useState(0)

  const handleChange = (key: keyof typeof formState, value: any) => {
    setFormState((prevState) => set({ ...prevState }, key, value))
  }

  const [filePreviews, setFilePreviews] = useState<string[]>([])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    // Convert files to an array and take only the first 6 files
    const selectedFiles = Array.from(files).slice(0, 6)

    // Convert files to URLs for preview
    const fileURLs = selectedFiles.map((file) => URL.createObjectURL(file))

    // Update the state
    setFilePreviews(fileURLs)
    handleChange('photo_urls', fileURLs)
  }

  const handleSubmit = async () => {
    // Do something with the form state, such as sending it to an API
    const res = await updateLover({
      ...formState,
    }).catch((e) => {
      console.error(e)
      return false
    })
    if (res) {
      console.log('success')
    }
  }

  return (
    <>
      <Title>Optional questions</Title>
      <Col className={'gap-8'}>
        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>Upload some pics!</label>
          <input
            type="file"
            onChange={handleFileChange}
            multiple // Allows multiple files to be selected
            className={'w-52'}
          />
          <div className="flex gap-2">
            {filePreviews.map((url, index) => (
              <img
                key={index}
                src={url}
                alt={`preview ${index}`}
                className="h-20 w-20 object-cover"
              />
            ))}
          </div>
        </Col>

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>
            What are your political beliefs?
          </label>
          <MultiCheckbox
            choices={{
              Libertarian: 'libertarian',
              Conservative: 'conservative',
              Liberal: 'liberal',
              Moderate: 'moderate',
              Anarchist: 'anarchist',
            }}
            selected={formState['political_beliefs']}
            onChange={(selected) => handleChange('political_beliefs', selected)}
          />
        </Col>

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>How tall are you?</label>
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
                  handleChange(
                    'height_in_inches',
                    Number(e.target.value) + heightFeet * 12
                  )
                }
                className={'w-16'}
              />
            </Col>
          </Row>
        </Col>

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>Where were you born?</label>
          <Input
            type="text"
            onChange={(e) => handleChange('born_in_location', e.target.value)}
            className={'w-52'}
          />
        </Col>
        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>Do you have pets?</label>
          <ChoicesToggleGroup
            currentChoice={formState['has_pets']}
            choicesMap={{
              Yes: true,
              No: false,
            }}
            setChoice={(c) => handleChange('has_pets', c)}
          />
        </Col>

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>
            What ethnicity/origin(s) are you?
          </label>
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
            selected={formState['ethnicity']}
            onChange={(selected) => handleChange('ethnicity', selected)}
          />
        </Col>

        <Col className={clsx(colClassName)}>
          <label className={clsx(labelClassName)}>
            What is the highest education level you've achieved?
          </label>
          <ChoicesToggleGroup
            currentChoice={formState['education_level']}
            choicesMap={{
              'High School': 'high-school',
              Bachelors: 'bachelors',
              Masters: 'masters',
              Doctorate: 'doctorate',
            }}
            setChoice={(c) => handleChange('education_level', c)}
          />
        </Col>
        <div>
          <Button onClick={handleSubmit}>Submit</Button>
        </div>
      </Col>
    </>
  )
}

const MultiCheckbox = (props: {
  choices: { [key: string]: string }
  selected: string[]
  onChange: (selected: string[]) => void
}) => {
  const { choices, selected, onChange } = props
  return (
    <Row className={'flex-wrap gap-3'}>
      {Object.entries(choices).map(([key, value]) => (
        <Checkbox
          key={key}
          label={key}
          checked={selected.includes(value)}
          toggle={(checked: boolean) => {
            if (checked) {
              onChange([...selected, value])
            } else {
              onChange(selected.filter((s) => s !== value))
            }
          }}
        />
      ))}
    </Row>
  )
}
