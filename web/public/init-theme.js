// run this in <head> as blocking to prevent flash of unstyled content. See theme-provider.tsx
{
  const autoDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const localTheme = localStorage.getItem('theme')
  const theme = localTheme ? JSON.parse(localTheme) : 'auto'

  document.documentElement.classList.remove('no-js')

  if (
    theme === 'dark' ||
    ((theme === 'auto' || theme === 'loading') && autoDark)
  ) {
    document.documentElement.classList.add('dark')
  }
}
