/**
 * Benchmarks for `Async` components, against plain React doing the same thing: a Suspense boundary around a
 * component that reads an already resolved promise with `React.use`.
 *
 * Run with `bun run bench` (or `npx vitest bench --run`). Nothing here asserts anything, and `vitest run` does not
 * pick this file up: it is only there so the numbers can be looked at.
 *
 * - "burst" mounts and unmounts a list of components in one commit.
 * - "in batches" mounts them in batches of 10 over many commits, like a list that renders more items as it is
 *   scrolled.
 *
 * The cost of every group should grow roughly linearly with the number of components.
 */
import { act, configure, render } from "@testing-library/react"
import { Effect, Layer, ManagedRuntime } from "effect"
import * as React from "react"
import { afterAll, bench, describe } from "vitest"
import * as Async from "./Async.js"
import * as Component from "./Component.js"
import * as ReactRuntime from "./ReactRuntime.js"


// The tests run in StrictMode, which renders everything twice. Measure what an app actually pays.
configure({ reactStrictMode: false })

const options = { time: 0, iterations: 5, warmupIterations: 1 }

const runtime = ReactRuntime.make(Layer.empty)
const managed = ManagedRuntime.make(ReactRuntime.preludeLayer)
const effectRuntime = await managed.context()

afterAll(() => managed.dispose())

const PlainInner = (props: { readonly promise: Promise<React.ReactNode> }) => React.use(props.promise)

const PlainItem = () => React.createElement(
    React.Suspense,
    { fallback: null },
    React.createElement(PlainInner, { promise: Promise.resolve(<i />) }),
)

const EffectItem = Component.make("AsyncEffectItem")(function*() {
    yield* Effect.void
    return <i />
}).pipe(
    Async.async,
    Component.withContext(runtime.context),
)

const range = (count: number) => Array.from({ length: count }, (_, i) => i)

describe.each([100, 1_000])("async, burst: mount and unmount %d components", count => {
    bench("plain React", async () => {
        let view!: ReturnType<typeof render>
        await act(async () => { view = render(<div>{range(count).map(i => <PlainItem key={i} />)}</div>) })
        view.unmount()
    }, options)

    bench("effect-view", async () => {
        let view!: ReturnType<typeof render>
        await act(async () => {
            view = render(
                <runtime.context.Provider value={effectRuntime}>
                    <div>{range(count).map(i => <EffectItem key={i} />)}</div>
                </runtime.context.Provider>
            )
        })
        view.unmount()
    }, options)
})

const batchSize = 10

describe.each([500, 2_000])("async, in batches: mount and unmount %d components", count => {
    bench("plain React", async () => {
        const views: ReturnType<typeof render>[] = []
        for (let batch = 0; batch < count / batchSize; batch++)
            await act(async () => { views.push(render(<div>{range(batchSize).map(i => <PlainItem key={i} />)}</div>)) })

        await act(async () => { views.forEach(view => { view.unmount() }) })
    }, options)

    bench("effect-view", async () => {
        const views: ReturnType<typeof render>[] = []
        for (let batch = 0; batch < count / batchSize; batch++)
            await act(async () => {
                views.push(render(
                    <runtime.context.Provider value={effectRuntime}>
                        <div>{range(batchSize).map(i => <EffectItem key={i} />)}</div>
                    </runtime.context.Provider>
                ))
            })

        await act(async () => { views.forEach(view => { view.unmount() }) })
    }, options)
})
