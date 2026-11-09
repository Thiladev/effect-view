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

    it("registers only the factory call of a pipeline", async () => {
        const result = await transform(`
import { Component } from "effect-view"

const Page = Component.make("Page")(function*() {
    return <main />
}).pipe(
    Component.withContext(runtime.context),
)
`)

        expect(result).toMatch(/__effectViewRefresh\(Component\.make\("Page"\)\(function\*\(\) \{\s+return <main \/>\s+\}\), import\.meta\.hot, "src\/View\.tsx:Page", "[a-z0-9]+", false\)\)\.pipe\(/)
        expect(result).toContain("Component.withContext(runtime.context)")
        expect(result).not.toContain("__effectViewRefreshView")
    })

    it("registers only the factory call of a class's trait pipeline", async () => {
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

        expect(result).toMatch(/class PostView extends \(import\.meta\.hot\?\.accept\(\), __effectViewRefresh\(Component\.make\("PostView"\)\([\s\S]*?\), import\.meta\.hot, "src\/View\.tsx:PostView", "[a-z0-9]+", false\)\)\.pipe\(\s+Async\.async,\s+Memoized\.memoized,/)
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

    it("registers a component wrapped by a user-defined helper function", async () => {
        const result = await transform(`
import { Component } from "effect-view"

const withLogging = (view) => view

export const LoggedView = withLogging(Component.make("LoggedView")(function*() {
    return <div />
}))
`)

        expect(result).toContain("withLogging((import.meta.hot?.accept(), __effectViewRefresh(Component.make(\"LoggedView\")")
        expect(result).toContain("\"src/View.tsx:LoggedView\"")
    })

    it("registers the base of a data-first withContext call, and leaves the call alone", async () => {
        const result = await transform(`
import { Component } from "effect-view"

const HomeBase = Component.make("Home")(function*() {
    return <div />
})

export const Home = Component.withContext(HomeBase, runtime.context)
`)

        expect(result).toContain("__effectViewRefresh(Component.make(\"Home\")")
        expect(result).toContain("\"src/View.tsx:HomeBase\"")
        expect(result).toContain("export const Home = Component.withContext(HomeBase, runtime.context)")
        expect(result).toContain("__effectViewAccept(import.meta.hot, [\"src/View.tsx:HomeBase\"])")
    })

    it("makes the registration accept the updates of its module, wherever the declaration ends up", async () => {
        const result = await transform(`
import { Component } from "effect-view"

export const Home = Component.make("Home")(function*() {
    return <div />
})
`)

        // Another plugin can move the declaration into a module of its own, leaving the end of this one behind.
        const declaration = result?.split("\n").filter(line => line.includes("const Home = ")).join("\n")
        expect(declaration).toContain("import.meta.hot?.accept()")
        expect(declaration).toContain("__effectViewRefresh(Component.make(\"Home\")")
    })

    it("does not register a descriptor derived from another definition", async () => {
        const result = await transform(`
import { Async, Component } from "effect-view"

export const Post = Component.make("Post")(function*() {
    return <div />
})

export const AsyncPost = Post.pipe(Async.async)
`)

        expect(result).toContain("__effectViewAccept(import.meta.hot, [\"src/View.tsx:Post\"])")
        expect(result).toContain("export const AsyncPost = Post.pipe(Async.async)")
    })

    it("does not register the first call of a curried factory, which is not a descriptor yet", async () => {
        expect(await transform(`
import { Component } from "effect-view"

export const make = Component.make("Named")
`)).toBeUndefined()
    })

    it("keeps the same hook signature when only literal content inside a hook call changes", async () => {
        const before = await transform(`
import { Component } from "effect-view"
export const CounterView = Component.make("CounterView")(function*() {
    const value = yield* Component.useOnMount(() => loadInitial(1))
    return <div>{value}</div>
})
`)
        const after = await transform(`
import { Component } from "effect-view"
export const CounterView = Component.make("CounterView")(function*() {
    const value = yield* Component.useOnMount(() => loadInitial(2))
    return <div>{value}</div>
})
`)

        const signatureOf = (code: string | undefined) => code?.match(/"src\/View\.tsx:CounterView", "([a-z0-9]+)"/)?.[1]
        expect(signatureOf(before)).toBeDefined()
        expect(signatureOf(before)).toBe(signatureOf(after))
    })

    it("changes the hook signature when a hook call is added", async () => {
        const before = await transform(`
import { Component } from "effect-view"
export const CounterView = Component.make("CounterView")(function*() {
    const value = yield* Component.useOnMount(() => loadInitial())
    return <div>{value}</div>
})
`)
        const after = await transform(`
import { Component } from "effect-view"
export const CounterView = Component.make("CounterView")(function*() {
    const value = yield* Component.useOnMount(() => loadInitial())
    yield* Component.useReactEffect(() => trackView(), [])
    return <div>{value}</div>
})
`)

        const signatureOf = (code: string | undefined) => code?.match(/"src\/View\.tsx:CounterView", "([a-z0-9]+)"/)?.[1]
        expect(signatureOf(before)).toBeDefined()
        expect(signatureOf(before)).not.toBe(signatureOf(after))
    })
})
