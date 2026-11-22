import * as fs from "node:fs"
import * as path from "node:path"
import type { LoadContext, Plugin } from "@docusaurus/types"

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

export interface Options {
  /** The changelog to publish, as written by Changesets. */
  readonly source: string
  /** The doc to generate, relative to the site directory. */
  readonly out: string
}

const frontMatter = `---
title: Changelog
description: What changed in each release of effect-view.
toc_max_heading_level: 2
custom_edit_url: null
---
`

const fence = /^\s*(```|~~~)/
// An inline code span, which can wrap over lines but not over a paragraph.
const inlineCode = /`(?:(?!\n[ \t]*\n)[^`])+`/g

// The changelog is Markdown, but Docusaurus compiles docs as MDX, where a stray `<` or `{` in prose is a syntax
// error that would fail the whole build. Escape them outside code, so that a release note can't break the site.
const escapeMdx = (prose: string): string => {
  let out = ""
  let last = 0
  for (const match of prose.matchAll(inlineCode)) {
    out += escapeText(prose.slice(last, match.index)) + match[0]
    last = match.index + match[0].length
  }
  return out + escapeText(prose.slice(last))
}

const escapeText = (text: string): string => text
  .replaceAll("<", "&lt;")
  .replaceAll("{", "\\{")
  .replaceAll("}", "\\}")

export const toDoc = (changelog: string): string => {
  const lines = changelog.replace(/^# .*\n+/, "").split("\n")
  const chunks: string[] = []
  let prose: string[] = []
  let inFence = false

  const flushProse = () => {
    if (prose.length > 0) chunks.push(escapeMdx(prose.join("\n")))
    prose = []
  }

  for (const line of lines) {
    if (fence.test(line)) {
      if (!inFence) flushProse()
      inFence = !inFence
      chunks.push(line)
    }
    else if (inFence)
      chunks.push(line)
    else
      prose.push(line)
  }
  flushProse()

  return `${frontMatter}\n${chunks.join("\n")}`
}

/**
 * Publishes the changelog of effect-view as a doc, generated from its source on every start and build, so that it
 * has no copy to keep in sync. The generated doc is not versioned.
 */
export default function changelogPlugin(context: LoadContext, options: unknown): Plugin {
  const { source: sourcePath, out: outPath } = options as Options
  const source = path.resolve(context.siteDir, sourcePath)
  const out = path.resolve(context.siteDir, outPath)

  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, toDoc(fs.readFileSync(source, "utf8")))

  return { name: "changelog" }
}
