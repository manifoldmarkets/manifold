import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import '../styles/global.scss';

export default function MyApp({ Component, pageProps }: AppProps) {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js').then(
        function (registration) {
          console.debug('Service Worker registration successful with scope: ', registration.scope);
        },
        function (err) {
          console.error('Service Worker registration failed: ', err);
        }
      );
    }
  }, []);

  return <Component {...pageProps} />;
}
