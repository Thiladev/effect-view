import path from "node:path"
import type { Plugin } from "vite"
import { describe, expect, it } from "vitest"
import { effectView } from "./index.js"


type TransformHook = Extract<
    NonNullable<Plugin["transform"]>,
    (...args: never[]) => unknown
>
type TransformPluginContext = ThisParameterType<TransformHook>

const runTransform = async (
    plugin: Plugin,
    code: string,
    id: string,
): Promise<string | undefined> => {
    const hook = plugin.transform
    if (!hook)
        return undefined

    const result = typeof hook === "function"
        ? await hook.call({} as TransformPluginContext, code, id)
        : await hook.handler.call({} as TransformPluginContext, code, id)

    if (!result)
        return undefined
    return typeof result === "string" ? result : result.code?.toString()
}

const transform = (
    code: string,
    id = path.join(process.cwd(), "src/View.tsx"),
): Promise<string | undefined> => runTransform(effectView(), code, id)

describe("effectView", () => {
    it("wraps a const Effect View descriptor", async () => {
        const result = await transform(`
import { Component } from "effect-view"
import * as React from "react"

export const CounterView = Component.make("CounterView")(function*() {
    const [count] = React.useState(0)
    return <div>{count}</div>
})
`)

        expect(result).toContain("import { accept as __effectViewAccept, register as __effectViewRefresh } from \"@effect-view/vite-plugin/runtime\"")
        expect(result).toContain("__effectViewRefresh(Component.make(\"CounterView\")")
        expect(result).toContain("\"src/View.tsx:CounterView\"")
        expect(result).toContain("__effectViewAccept(import.meta.hot, [\"src/View.tsx:CounterView\"])")
    })

    it("registers a pipeline before withContext", async () => {
        const result = await transform(`
import { Component } from "effect-view"

const Page = Component.make("Page")(function*() {
    return <main />
}).pipe(
    Component.withContext(runtime.context),
)
`)

        expect(result).toContain("(__effectViewRefreshView) => __effectViewRefresh(__effectViewRefreshView")
        expect(result).toContain("Component.withContext(runtime.context)")
        expect(result).not.toContain("__effectViewRefresh(Component.make(\"Page\")")
    })

    it("wraps a class's complete trait pipeline", async () => {
        const result = await transform(`
import { Async, Component, Memoized } from "effect-view"

class PostView extends Component.make("PostView")(function*() {
    const value = yield* Component.useOnMount(load)
    return <div>{value}</div>
}).pipe(
    Async.async,
    Memoized.memoized,
) {}
`)

        expect(result).toContain("class PostView extends __effectViewRefresh(Component.make(\"PostView\")")
        expect(result).toContain("Memoized.memoized,")
        expect(result).toContain("\"src/View.tsx:PostView\"")
    })

    it("supports aliased Component imports and refresh reset", async () => {
        const result = await transform(`
// @refresh reset
import { Component as View } from "effect-view"

const Probe = View.makeUntraced(function*() {
    return null
})
`)

        expect(result).toContain("__effectViewRefresh(View.makeUntraced")
        expect(result).toMatch(/"src\/View\.tsx:Probe", "[a-z0-9]+", true/)
    })

    it("ignores modules without Effect View definitions", async () => {
        expect(await transform(`
import * as React from "react"
export function View() {
    return <div />
}
`)).toBeUndefined()
    })

    it("keeps instrumenting a module when all Effect Views are removed", async () => {
        const plugin = effectView() as Plugin
        const id = path.join(process.cwd(), "src/Removed.tsx")

        await runTransform(plugin, `
import { Component } from "effect-view"
export const Probe = Component.makeUntraced(function*() {
    return null
})
`, id)

        const result = await runTransform(plugin, `
export const value = 1
`, id)

        expect(result).toContain("__effectViewAccept(import.meta.hot, [])")
        expect(result).not.toContain("__effectViewRefresh(")
    })

    it("ignores the legacy effect-fc package", async () => {
        expect(await transform(`
import { Component } from "effect-fc"
export const Legacy = Component.makeUntraced(function*() {
    return null
})
`)).toBeUndefined()
    })
})
