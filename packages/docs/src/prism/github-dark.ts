import type { PrismTheme } from "prism-react-renderer"

/**
 * Matches the classic "GitHub Dark" token palette effect.website uses for
 * its dark-mode code blocks (extracted from their rendered token styles) -
 * prism-react-renderer doesn't ship this one as a preset.
 */
const githubDark: PrismTheme = {
  plain: {
    color: "#e1e4e8",
    backgroundColor: "transparent",
  },
  styles: [
    {
      types: ["comment", "prolog", "doctype", "cdata"],
      style: { color: "#6a737d" },
    },
    {
      types: ["punctuation", "operator", "entity", "url", "variable"],
      style: { color: "#e1e4e8" },
    },
    {
      types: [
        "number",
        "boolean",
        "constant",
        "symbol",
        "deleted",
        "class-name",
        "maybe-class-name",
        "builtin",
      ],
      style: { color: "#79b8ff" },
    },
    {
      types: ["selector", "attr-name", "string", "char", "inserted", "attr-value"],
      style: { color: "#9ecbff" },
    },
    {
      types: ["atrule", "keyword"],
      style: { color: "#f97583" },
    },
    {
      types: ["function", "method"],
      style: { color: "#b392f0" },
    },
    {
      types: ["regex", "important"],
      style: { color: "#ffab70" },
    },
    {
      types: ["tag"],
      style: { color: "#85e89d" },
    },
  ],
}

export default githubDark
