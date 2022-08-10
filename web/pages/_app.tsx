import 'tailwindcss/tailwind.css'
import "../styles/spinner.scss";
import type { AppProps } from "next/app";

export default function MyApp({ Component, pageProps }: AppProps) {
    return <Component {...pageProps} />;
}
