import type { NextPage } from "next";
import Head from "next/head";
import React from "react";
import LandingPage from "./landing-page";

const Home: NextPage = () => {
  return (
    <div>
      <Head>
        <title>Mantic Markets</title>
        <meta name="description" content="Create and bet" />
        <link rel="icon" href="/favicon.ico" />

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link
          href="https://fonts.googleapis.com/css2?family=Major+Mono+Display&display=swap"
          rel="stylesheet"
        />
      </Head>

      <LandingPage />
    </div>
  );
};

export default Home;
