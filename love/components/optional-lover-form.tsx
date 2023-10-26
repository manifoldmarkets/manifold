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

export const OptionalLoveUserForm = (props: {
  lover: rowFor<'lovers'>
  setLoverState: (key: keyof rowFor<'lovers'>, value: any) => void
  butonLabel?: string
}) => {
  const { lover, butonLabel, setLoverState } = props

  const router = useRouter()
  const [heightFeet, setHeightFeet] = useState(0)

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
          <label className={clsx(labelClassName)}>Religious beliefs</label>
          <Input
            type="text"
            onChange={(e) => setLoverState('religious_beliefs', e.target.value)}
            className={'w-full sm:w-96'}
            value={lover['religious_beliefs'] ?? undefined}
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
            Highest completed education level
          </label>
          <ChoicesToggleGroup
            currentChoice={lover['education_level'] ?? ''}
            choicesMap={{
              'High school': 'high-school',
              'Some college': 'some-college',
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
