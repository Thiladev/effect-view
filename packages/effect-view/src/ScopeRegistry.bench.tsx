/**
 * Benchmarks for the cost of giving every component instance a `Scope`.
 *
 * Run with `bun run bench` (or `npx vitest bench --run`). Nothing here asserts anything, and `vitest run` does not
 * pick this file up: it is only there so the numbers can be looked at.
 *
 * - "registry" calls the `ScopeRegistry` directly, without React, with its sweeper running and one lifecycle event
 *   per scheduler turn, as when components mount over time.
 * - "react" mounts and unmounts a list of components in jsdom, once with plain React components and once with
 *   effect-view components, so the difference between the two is what effect-view adds.
 * - "react, in batches" does the same, but mounts the components in batches of 10 over many commits, like a list
 *   that renders more items as it is scrolled.
 * - "react, one parent" renders the list the way an app does: a parent component yields `Item.use` once and renders
 *   the items as plain function components, without a `withContext` wrapper per item. In batches, the parent grows
 *   its list by 10 items per commit, re-rendering the whole list each time (quadratic for plain React too).
 *
 * The cost of every group should grow roughly linearly with the number of components. If doubling the count more
 * than doubles the time, something has gone quadratic again.
 */
import { act, configure, render } from "@testing-library/react"
import { Effect, Layer, ManagedRuntime } from "effect"
import { afterAll, bench, describe } from "vitest"
import * as Component from "./Component.js"
import * as ReactRuntime from "./ReactRuntime.js"
import * as ScopeRegistry from "./ScopeRegistry.js"


// The tests run in StrictMode, which renders everything twice. Measure what an app actually pays.
configure({ reactStrictMode: false })

const options = { time: 0, iterations: 5, warmupIterations: 1 }

const registryOptions: ScopeRegistry.ScopeRegistryService.RegisterOptions = {
    finalizerExecutionStrategy: "sequential",
    finalizerExecutionDebounce: "1 second",
    scopeCommitTimeout: "1 minute",
}

/**
 * The life of `count` scopes: registered while rendering, committed on mount, released on unmount, then closed.
 */
const registryLifecycle = (count: number) => Effect.scoped(Effect.gen(function*() {
    const registry = (yield* ScopeRegistry.make()) as ScopeRegistry.ScopeRegistryServiceImpl
    yield* Effect.forkScoped(registry.run)

    const keys = Array.from({ length: count }, () => ScopeRegistry.makeKey())
    yield* Effect.forEach(keys, key => Effect.andThen(registry.register(key, registryOptions), Effect.yieldNow), { discard: true })
    yield* Effect.forEach(keys, key => Effect.andThen(registry.commit(key), Effect.yieldNow), { discard: true })
    yield* Effect.forEach(keys, key => Effect.andThen(registry.release(key), Effect.yieldNow), { discard: true })
}))

describe.each([1_000, 4_000])("registry: %d scopes (register, commit, release, close)", count => {
    bench("ScopeRegistry", () => Effect.runPromise(registryLifecycle(count)), options)
})


const runtime = ReactRuntime.make(Layer.empty)
const managed = ManagedRuntime.make(ReactRuntime.preludeLayer)
const effectRuntime = await managed.context()

afterAll(() => managed.dispose())

const PlainItem = () => <i />

const EffectItem = Component.make("EffectItem")(function*() {
    yield* Effect.void
    return <i />
}).pipe(Component.withContext(runtime.context))

const range = (count: number) => Array.from({ length: count }, (_, i) => i)

describe.each([100, 1_000])("react: mount and unmount %d components", count => {
    bench("plain React", () => {
        render(<div>{range(count).map(i => <PlainItem key={i} />)}</div>).unmount()
    }, options)

    bench("effect-view", () => {
        render(
            <runtime.context.Provider value={effectRuntime}>
                <div>{range(count).map(i => <EffectItem key={i} />)}</div>
            </runtime.context.Provider>
        ).unmount()
    }, options)
})

const batchSize = 10

describe.each([500, 2_000])("react, in batches: mount and unmount %d components", count => {
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


const UsedItem = Component.make("UsedItem")(function*() {
    yield* Effect.void
    return <i />
})

const EffectList = Component.make("EffectList")(function*(props: { readonly count: number }) {
    const Item = yield* UsedItem.use
    return <div>{range(props.count).map(i => <Item key={i} />)}</div>
}).pipe(Component.withContext(runtime.context))

const PlainList = (props: { readonly count: number }) => <div>{range(props.count).map(i => <PlainItem key={i} />)}</div>

describe.each([100, 1_000])("react, one parent: mount and unmount %d components", count => {
    bench("plain React", () => {
        render(<PlainList count={count} />).unmount()
    }, options)

    bench("effect-view", () => {
        render(
            <runtime.context.Provider value={effectRuntime}>
                <EffectList count={count} />
            </runtime.context.Provider>
        ).unmount()
    }, options)
})

// Every step re-renders the whole list, so this grows quadratically for plain React as well. Compare the two
// benchmarks of a group with each other, and do not expect the numbers to scale linearly.
describe.each([250, 1_000])("react, one parent, in batches: grow to %d components and unmount", count => {
    bench("plain React", async () => {
        let view!: ReturnType<typeof render>
        await act(async () => { view = render(<PlainList count={batchSize} />) })
        for (let size = 2 * batchSize; size <= count; size += batchSize)
            await act(async () => { view.rerender(<PlainList count={size} />) })

        await act(async () => { view.unmount() })
    }, options)

    bench("effect-view", async () => {
        const tree = (size: number) => (
            <runtime.context.Provider value={effectRuntime}>
                <EffectList count={size} />
            </runtime.context.Provider>
        )

        let view!: ReturnType<typeof render>
        await act(async () => { view = render(tree(batchSize)) })
        for (let size = 2 * batchSize; size <= count; size += batchSize)
            await act(async () => { view.rerender(tree(size)) })

        await act(async () => { view.unmount() })
    }, options)
})
