// Filters.tsx
import { useState, FC } from 'react'
import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'
import { Button } from 'web/components/buttons/button'
import { Input } from 'web/components/widgets/input'
import { Row as rowFor } from 'common/supabase/utils'
import { Checkbox } from 'web/components/widgets/checkbox'
import clsx from 'clsx'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { MultiCheckbox } from 'web/components/multi-checkbox'

interface FiltersProps {
  onApplyFilters: (filters: Partial<rowFor<'lovers'>>) => void
}
const labelClassName = 'font-semibold'
export const Filters: FC<FiltersProps> = ({ onApplyFilters }) => {
  const [filters, setFilters] = useState<Partial<rowFor<'lovers'>>>({
    gender: undefined,
    pref_age_max: undefined,
    pref_age_min: undefined,
    city: undefined,
    has_kids: false,
    wants_kids_strength: -1,
    is_smoker: false,
    pref_relation_styles: undefined,
  } as any)

  const updateFilter = (newState: Partial<rowFor<'lovers'>>) => {
    setFilters((prevState) => ({ ...prevState, ...newState }))
  }

  const applyFilters = () => {
    onApplyFilters(filters)
  }
  const cities: { [key: string]: string } = {
    'San Francisco': 'sf',
    'New York City': 'nyc',
    London: 'london',
    All: '',
  }
  const [showFilters, setShowFilters] = useState(false)

  const rowClassName = 'gap-2'
  return (
    <Row className="bg-canvas-0 w-full gap-2 p-2">
      <Col className={'w-full'}>
        <Row className={'mb-2 justify-between'}>
          <span className=" text-xl">Filters</span>
          <Button
            color={'gray-outline'}
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? 'Hide filters' : 'Show filters'}
          </Button>
        </Row>
        {showFilters && (
          <>
            <Row className={'flex-wrap items-center gap-4'}>
              <Col className={clsx(rowClassName)}>
                <label className={clsx(labelClassName)}>Gender</label>
                <select
                  className={'border-ink-200 rounded-md'}
                  onChange={(e) =>
                    updateFilter({
                      gender: e.target.value,
                    })
                  }
                  value={filters.gender}
                >
                  <option value="">All</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="trans-female">Trans Female</option>
                  <option value="trans-male">Trans Male</option>
                  <option value="non-binary">Non-Binary</option>
                </select>
              </Col>

              <Col className={clsx(rowClassName)}>
                <label className={clsx(labelClassName)}>Min age</label>
                <Input
                  type="number"
                  className={'w-20'}
                  value={filters.pref_age_min}
                  onChange={(e) =>
                    updateFilter({ pref_age_min: Number(e.target.value) })
                  }
                />
              </Col>

              <Col className={clsx(rowClassName)}>
                <label className={clsx(labelClassName)}>Max age</label>
                <Input
                  type="number"
                  value={filters.pref_age_max}
                  className={'w-20'}
                  onChange={(e) =>
                    updateFilter({ pref_age_max: Number(e.target.value) })
                  }
                />
              </Col>
              <Col className={clsx(rowClassName)}>
                <label className={clsx(labelClassName)}>City</label>
                <ChoicesToggleGroup
                  currentChoice={filters.city ?? ''}
                  choicesMap={cities}
                  setChoice={(c) => updateFilter({ city: c as string })}
                />
              </Col>

              <Col className={clsx(rowClassName)}>
                <label className={clsx(labelClassName)}>Wants kids</label>
                <ChoicesToggleGroup
                  currentChoice={filters.wants_kids_strength ?? 0}
                  choicesMap={{
                    No: 0,
                    Yes: 2,
                    'N/A': -1,
                  }}
                  setChoice={(c) =>
                    updateFilter({ wants_kids_strength: Number(c) })
                  }
                />
              </Col>
              <Col className={clsx(rowClassName)}>
                <label className={clsx(labelClassName)}>
                  Relationship style
                </label>
                <MultiCheckbox
                  selected={filters.pref_relation_styles ?? []}
                  choices={
                    {
                      Monogamous: 'mono',
                      Polyamorous: 'poly',
                      'Open Relationship': 'open',
                      Other: 'other',
                    } as any
                  }
                  onChange={(c) => {
                    updateFilter({ pref_relation_styles: c })
                  }}
                />
              </Col>
            </Row>
            <Row className={'mt-2'}>
              <Col>
                <label className={clsx(labelClassName)}>Other</label>
                <Row className={'mt-2 gap-2'}>
                  <Row className={clsx(rowClassName)}>
                    <Checkbox
                      label={'Has Kids'}
                      checked={!!filters.has_kids}
                      toggle={(checked) =>
                        updateFilter({ has_kids: checked ? 1 : 0 })
                      }
                    />
                  </Row>
                  <Row className={clsx(rowClassName)}>
                    <Checkbox
                      label={'Is Smoker'}
                      checked={!!filters.is_smoker}
                      toggle={(checked) => updateFilter({ is_smoker: checked })}
                    />
                  </Row>
                </Row>
              </Col>
            </Row>
            <Row className={'justify-end'}>
              <Button onClick={applyFilters}>Apply Filters</Button>
            </Row>
          </>
        )}
      </Col>
    </Row>
  )
}
