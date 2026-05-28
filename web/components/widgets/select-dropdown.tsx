import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  type MenuItemsProps,
} from '@headlessui/react'
import { CheckIcon, SelectorIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { ReactNode } from 'react'

import { AnimationOrNothing } from './customizeable-dropdown'

export type SelectDropdownOption<T extends string | number> = {
  value: T
  label: ReactNode
  disabled?: boolean
  // Optional extra classes applied to the row's button — useful when you
  // want a row's accent/background to fill the whole row width instead
  // of being clipped by the inner truncate span around `label`.
  buttonClassName?: string
}

type AnchorProps = NonNullable<MenuItemsProps['anchor']>

/**
 * Styled replacement for a native `<select>`.
 *
 * Renders a button trigger plus a floating menu that matches the rest of the
 * site's design language (canvas background, ink text, indigo focus ring).
 * Unlike a native `<select>` the menu is fully themable across platforms
 * (including dark mode) and keyboard accessible via headlessui.
 */
export function SelectDropdown<T extends string | number>(props: {
  value: T
  options: SelectDropdownOption<T>[]
  onChange: (value: T) => void
  className?: string
  buttonClassName?: string
  menuClassName?: string
  /** Rendered left of the selected label in the trigger (icon / emoji). */
  buttonPrefix?: ReactNode
  /** Overrides the trigger label; defaults to the selected option's label. */
  renderButtonLabel?: (
    selected: SelectDropdownOption<T> | undefined
  ) => ReactNode
  disabled?: boolean
  placeholder?: ReactNode
  anchor?: AnchorProps
  'aria-label'?: string
}) {
  const {
    value,
    options,
    onChange,
    className,
    buttonClassName,
    menuClassName,
    buttonPrefix,
    renderButtonLabel,
    disabled,
    placeholder = 'Select…',
    anchor,
    'aria-label': ariaLabel,
  } = props

  const selected = options.find((o) => o.value === value)
  const label = renderButtonLabel
    ? renderButtonLabel(selected)
    : selected?.label ?? placeholder

  return (
    <Menu
      as="div"
      className={clsx('relative inline-block text-left', className)}
    >
      {({ open }) => (
        <>
          <MenuButton
            disabled={disabled}
            aria-label={ariaLabel}
            className={clsx(
              'bg-canvas-0 border-ink-200 text-ink-700 hover:bg-canvas-50 hover:border-ink-300',
              'focus:border-primary-500 focus:ring-primary-500/30 focus:outline-none focus:ring-2',
              'flex w-full items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-60',
              buttonClassName
            )}
          >
            {buttonPrefix}
            <span className="min-w-0 flex-1 truncate text-left">{label}</span>
            <SelectorIcon
              className={clsx(
                'text-ink-400 h-4 w-4 flex-shrink-0 transition-transform',
                open && 'text-ink-600'
              )}
              aria-hidden
            />
          </MenuButton>
          <AnimationOrNothing show={open} animate>
            <MenuItems
              anchor={anchor ?? { to: 'bottom start', gap: 4, padding: 4 }}
              className={clsx(
                'bg-canvas-0 ring-ink-1000/10 dark:ring-ink-1000/20',
                'z-30 min-w-[var(--button-width)] overflow-auto rounded-md py-1 shadow-lg ring-1 focus:outline-none',
                'max-h-80',
                menuClassName
              )}
              style={{
                // Make the menu at least as wide as the trigger
                // (headlessui exposes --button-width on anchored menus).
                minWidth: 'var(--button-width)',
              }}
            >
              {options.map((opt) => {
                const isSelected = opt.value === value
                return (
                  <MenuItem key={String(opt.value)} disabled={opt.disabled}>
                    <button
                      type="button"
                      onClick={() => onChange(opt.value)}
                      disabled={opt.disabled}
                      className={clsx(
                        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
                        'data-[focus]:bg-ink-100 data-[focus]:text-ink-900',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                        isSelected
                          ? 'text-ink-900 font-medium'
                          : 'text-ink-700',
                        opt.buttonClassName
                      )}
                    >
                      <CheckIcon
                        className={clsx(
                          'h-4 w-4 flex-shrink-0',
                          isSelected ? 'text-primary-600' : 'opacity-0'
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {opt.label}
                      </span>
                    </button>
                  </MenuItem>
                )
              })}
            </MenuItems>
          </AnimationOrNothing>
        </>
      )}
    </Menu>
  )
}
