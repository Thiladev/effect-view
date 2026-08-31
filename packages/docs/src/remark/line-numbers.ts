const numberedLanguages = new Set(["ts", "tsx", "js", "jsx"])

interface MdastNode {
  type: string
  lang?: string
  meta?: string | null
  value?: string
  children?: MdastNode[]
}

function visitCodeNodes(node: MdastNode, onCode: (code: MdastNode) => void): void {
  if (!node.children) return
  for (const child of node.children) {
    if (child.type === "code") onCode(child)
    visitCodeNodes(child, onCode)
  }
}

/**
 * Turns on line numbers for multi-line ts/tsx/js/jsx fences that don't
 * already opt in or out, matching Effect's docs code block presentation.
 */
export default function remarkLineNumbers() {
  return (tree: MdastNode) => {
    visitCodeNodes(tree, (code) => {
      const lang = (code.lang ?? "").toLowerCase()
      if (!numberedLanguages.has(lang)) return

      const meta = code.meta ?? ""
      if (/showLineNumbers/.test(meta)) return

      const lineCount = (code.value ?? "").split("\n").length
      if (lineCount <= 1) return

      code.meta = `${meta} showLineNumbers`.trim()
    })
  }
}
