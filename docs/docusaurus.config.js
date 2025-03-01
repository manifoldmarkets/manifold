// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const lightCodeTheme = require('prism-react-renderer/themes/github')
const darkCodeTheme = require('prism-react-renderer/themes/dracula')
const math = require('remark-math')
const katex = require('rehype-katex')

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Manifold Docs',
  tagline: 'Learn more about the BESTEST prediction market platform~',
  url: 'https://docs.manifold.markets',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',
  favicon: 'https://manifold.markets/favicon.ico',
  organizationName: 'manifoldmarkets', // Usually your GitHub org/user name.
  projectName: 'docs', // Usually your repo name.

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/',
          sidebarPath: require.resolve('./sidebars.js'),
          editUrl: 'https://github.com/manifoldmarkets/manifold/tree/main/docs',
          remarkPlugins: [math],
          rehypePlugins: [katex],
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],

  stylesheets: [
    {
      href: 'https://cdn.jsdelivr.net/npm/katex@0.13.24/dist/katex.min.css',
      type: 'text/css',
      integrity:
        'sha384-odtC+0UGzzFL/6PNoE8rX/SPcQDXBJ+uRepguP4QkPCm2LBxH3FA3y+fKSiJ+AmM',
      crossorigin: 'anonymous',
    },
  ],

  scripts: [
    {
      src: 'https://cdn.jsdelivr.net/npm/link-summoner@1.0.2/dist/browser.min.js',
      async: 'true',
    },
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: 'Manifold Docs',
        logo: {
          alt: 'Manifold Logo',
          src: 'https://manifold.markets/logo.svg',
        },
        items: [
          // {
          //   type: 'doc',
          //   docId: 'api',
          //   position: 'left',
          //   label: 'Docs',
          // },
          // {
          //   href: 'https://github.com/manifoldmarkets/manifold/tree/main/docs/docs',
          //   label: 'GitHub',
          //   position: 'right',
          // },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Manifold',
            items: [
              {
                label: 'Manifold',
                to: 'https://manifold.markets',
              },
              {
                label: 'Docs',
                to: '/',
              },
            ],
          },
          {
            title: 'Community',
            items: [
              {
                label: 'Discord',
                href: 'https://discord.gg/eHQBNBqXuh',
              },
              {
                label: 'Twitter',
                href: 'https://twitter.com/manifoldmarkets',
              },
            ],
          },
          {
            title: 'More',
            items: [
              {
                label: 'Blog',
                to: 'https://manifoldmarkets.substack.com',
              },
              {
                label: 'GitHub',
                href: 'https://github.com/manifoldmarkets/manifold/',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Manifold Markets, Inc.`,
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
      },
    }),
}

module.exports = config
