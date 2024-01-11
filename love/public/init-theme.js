// run this in <head> as blocking to prevent flash of unstyled content. See theme-provider.tsx
{
  const autoDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const localTheme = localStorage.getItem('theme')
  const theme = localTheme ? JSON.parse(localTheme) : 'auto'

  if (theme === 'dark' || (theme === 'auto' && autoDark)) {
    document.documentElement.classList.add('dark')
  }
}
