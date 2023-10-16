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

export const RequiredLoveUserForm = (props: { onSuccess: () => void }) => {
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
