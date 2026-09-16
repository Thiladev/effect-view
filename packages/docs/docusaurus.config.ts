import type * as Preset from "@docusaurus/preset-classic"
import type { Config } from "@docusaurus/types"
import { themes as prismThemes } from "prism-react-renderer"

import githubDark from "./src/prism/github-dark"
import remarkLineNumbers from "./src/remark/line-numbers"

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: "Effect View",
  tagline: "Write React function components with Effect",
  favicon: "img/favicon.ico",

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: "https://thiladev.github.io",
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: "/effect-view/",

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: "Thiladev", // Usually your GitHub org/user name.
  projectName: "effect-view", // Usually your repo name.

  onBrokenLinks: "throw",

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          editUrl:
            "https://github.com/Thiladev/effect-view/tree/main/packages/docs/",
          remarkPlugins: [remarkLineNumbers],
          lastVersion: "current",
          versions: {
            current: {
              label: "effect-view v0",
            },
            "effect-fc-v0": {
              label: "effect-fc v0",
              path: "effect-fc/v0",
            },
          },
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    colorMode: {
      defaultMode: "dark",
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "Effect View",
      logo: {
        alt: "Effect View logo",
        src: "img/logo.svg",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "docsSidebar",
          position: "left",
          label: "Docs",
        },
        {
          type: "docsVersionDropdown",
          position: "right",
        },
        {
          href: "https://www.npmjs.com/package/effect-view",
          label: "npm",
          position: "right",
        },
        {
          href: "https://github.com/Thiladev/effect-view",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            {
              label: "Getting Started",
              to: "/docs/getting-started",
            },
          ],
        },
        {
          title: "Project",
          items: [
            {
              label: "GitHub",
              href: "https://github.com/Thiladev/effect-view",
            },
            {
              label: "Example App",
              href: "https://github.com/Thiladev/effect-view/tree/main/packages/example",
            },
          ],
        },
        {
          title: "Ecosystem",
          items: [
            {
              label: "Effect",
              href: "https://effect.website/",
            },
            {
              label: "React",
              href: "https://react.dev/",
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Effect View contributors. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: githubDark,
    },
  } satisfies Preset.ThemeConfig,
}

export default config
