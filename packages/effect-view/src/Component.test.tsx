import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Context, Effect, HashMap, Layer, SubscriptionRef } from "effect"
import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import * as Component from "./Component.js"
import * as ReactRuntime from "./ReactRuntime.js"
import * as Refreshable from "./Refreshable.js"
import * as ScopeRegistry from "./ScopeRegistry.js"


class ValueService extends Context.Service<ValueService, { readonly value: string }>()("ValueService") {}

afterEach(() => {
    vi.useRealTimers()
})

describe("Component", () => {
    it("does not rerun useOnMount across rerenders after Strict Mode initialization", async () => {
        const onMount = vi.fn(() => Effect.succeed("mounted"))
        const runtime = ReactRuntime.make(Layer.empty)
        const effectRuntime = await runtime.runtime.context()

        const Probe = Component.makeUntraced("UseOnMountProbe")(function*() {
            const value = yield* Component.useOnMount(onMount)
            return <div>{value}</div>
        }).pipe(
            Component.withContext(runtime.context)
        )

        const view = render(
            <runtime.context.Provider value={effectRuntime}>
                <Probe />
            </runtime.context.Provider>
        )

        await screen.findByText("mounted")
        expect(onMount).toHaveBeenCalledTimes(2)

        view.rerender(
            <runtime.context.Provider value={effectRuntime}>
                <Probe />
            </runtime.context.Provider>
        )
        expect(await screen.findByText("mounted")).toBeTruthy()
        expect(onMount).toHaveBeenCalledTimes(2)

        view.unmount()
        await runtime.runtime.dispose()
    })

    it("recomputes useOnChange only when dependencies change", async () => {
        const onChange = vi.fn((value: number) => Effect.succeed(`value:${value}`))
        const runtime = ReactRuntime.make(Layer.empty)
        const effectRuntime = await runtime.runtime.context()

        const Probe = Component.makeUntraced("UseOnChangeProbe")(function*(props: { readonly value: number }) {
            const result = yield* Component.useOnChange(() => onChange(props.value), [props.value], {
                finalizerExecutionDebounce: 0,
            })

            return <div>{result}</div>
        }).pipe(
            Component.withContext(runtime.context)
        )

        const view = render(
            <runtime.context.Provider value={effectRuntime}>
                <Probe value={1} />
            </runtime.context.Provider>
        )

        await screen.findByText("value:1")
        expect(onChange).toHaveBeenCalledTimes(2)

        view.rerender(
            <runtime.context.Provider value={effectRuntime}>
                <Probe value={1} />
            </runtime.context.Provider>
        )

        expect(await screen.findByText("value:1")).toBeTruthy()
        expect(onChange).toHaveBeenCalledTimes(2)

        view.rerender(
            <runtime.context.Provider value={effectRuntime}>
                <Probe value={2} />
            </runtime.context.Provider>
        )

        await screen.findByText("value:2")
        expect(onChange).toHaveBeenCalledTimes(4)

        view.unmount()
        await runtime.runtime.dispose()
    })

    it("closes the previous scope on dependency changes and unmount", async () => {
        const cleanup = vi.fn()
        const runtime = ReactRuntime.make(Layer.empty)
        const effectRuntime = await runtime.runtime.context()

        const Probe = Component.makeUntraced("ScopeCleanupProbe")(function*(props: { readonly value: string }) {
            const result = yield* Component.useOnChange(
                () => Effect.gen(function*() {
                    yield* Effect.addFinalizer(() => Effect.sync(() => cleanup(props.value)))
                    return props.value
                }),
                [props.value],
                { finalizerExecutionDebounce: 0 },
            )

            return <div>{result}</div>
        }).pipe(
            Component.withContext(runtime.context)
        )

        const view = render(
            <runtime.context.Provider value={effectRuntime}>
                <Probe value="first" />
            </runtime.context.Provider>
        )

        await screen.findByText("first")
        expect(cleanup).not.toHaveBeenCalled()

        view.rerender(
            <runtime.context.Provider value={effectRuntime}>
                <Probe value="second" />
            </runtime.context.Provider>
        )

        await screen.findByText("second")
        await waitFor(() => expect(cleanup).toHaveBeenCalledWith("first"))
        expect(cleanup).toHaveBeenCalledTimes(1)

        view.unmount()

        await waitFor(() => expect(cleanup).toHaveBeenCalledWith("second"))
        expect(cleanup).toHaveBeenCalledTimes(2)
        await runtime.runtime.dispose()
    })

    it("runs useReactEffect setup and cleanup when dependencies change", async () => {
        const lifecycle = vi.fn<(message: string) => void>()
        const runtime = ReactRuntime.make(Layer.empty)
        const effectRuntime = await runtime.runtime.context()

        const Probe = Component.makeUntraced("UseReactEffectProbe")(function*(props: { readonly value: string }) {
            yield* Component.useReactEffect(() =>
                Effect.gen(function*() {
                    yield* Effect.sync(() => lifecycle(`mount:${props.value}`))
                    yield* Effect.addFinalizer(() => Effect.sync(() => lifecycle(`cleanup:${props.value}`)))
                }),
            [props.value])

            return <div>{props.value}</div>
        }).pipe(
            Component.withContext(runtime.context)
        )

        const view = render(
            <runtime.context.Provider value={effectRuntime}>
                <Probe value="first" />
            </runtime.context.Provider>
        )

        await screen.findByText("first")
        await waitFor(() => expect(lifecycle).toHaveBeenCalledWith("mount:first"))

        view.rerender(
            <runtime.context.Provider value={effectRuntime}>
                <Probe value="second" />
            </runtime.context.Provider>
        )

        await screen.findByText("second")
        await waitFor(() => expect(lifecycle).toHaveBeenCalledWith("cleanup:first"))
        await waitFor(() => expect(lifecycle).toHaveBeenCalledWith("mount:second"))

        view.unmount()

        await waitFor(() => expect(lifecycle).toHaveBeenCalledWith("cleanup:second"))
        expect(lifecycle.mock.calls.map(([message]) => message)).toEqual([
            "mount:first",
            "cleanup:first",
            "mount:first",
            "cleanup:first",
            "mount:second",
            "cleanup:second",
        ])
        await runtime.runtime.dispose()
    })

    it("keeps useCallbackSync stable until dependencies change", async () => {
        const runtime = ReactRuntime.make(Layer.empty)
        const effectRuntime = await runtime.runtime.context()
        const seenCallbacks: Array<(value: number) => string> = []

        const Probe = Component.makeUntraced("UseCallbackSyncProbe")(function*(props: { readonly prefix: string }) {
            const callback = yield* Component.useCallbackSync(
                (value: number) => Effect.succeed(`${props.prefix}:${value}`),
                [props.prefix],
            )

            yield* Component.useOnMount(() => Effect.sync(() => {
                seenCallbacks.push(callback)
            }))

            React.useEffect(() => {
                seenCallbacks.push(callback)
            }, [callback])

            return <div>{callback(1)}</div>
        }).pipe(
            Component.withContext(runtime.context)
        )

        const view = render(
            <runtime.context.Provider value={effectRuntime}>
                <Probe prefix="a" />
            </runtime.context.Provider>
        )

        await screen.findByText("a:1")
        const initialLength = seenCallbacks.length
        const initialCallback = seenCallbacks.at(-1)
        expect(initialCallback?.(2)).toBe("a:2")

        view.rerender(
            <runtime.context.Provider value={effectRuntime}>
                <Probe prefix="a" />
            </runtime.context.Provider>
        )

        await screen.findByText("a:1")
        expect(seenCallbacks).toHaveLength(initialLength)

        view.rerender(
            <runtime.context.Provider value={effectRuntime}>
                <Probe prefix="b" />
            </runtime.context.Provider>
        )

        await screen.findByText("b:1")
        await waitFor(() => expect(seenCallbacks.length).toBeGreaterThan(initialLength))
        expect(seenCallbacks.at(-1)).not.toBe(initialCallback)
        expect(seenCallbacks.at(-1)?.(2)).toBe("b:2")

        view.unmount()
        await runtime.runtime.dispose()
    })

    it("delays cleanup according to finalizerExecutionDebounce", async () => {
        const cleanup = vi.fn()
        const runtime = ReactRuntime.make(Layer.empty)
        const effectRuntime = await runtime.runtime.context()

        const Probe = Component.makeUntraced("DebouncedCleanupProbe")(function*(props: { readonly value: string }) {
            const result = yield* Component.useOnChange(
                () => Effect.gen(function*() {
                    yield* Effect.addFinalizer(() => Effect.sync(() => cleanup(props.value)))
                    return props.value
                }),
                [props.value],
                { finalizerExecutionDebounce: "20 millis" },
            )

            return <div>{result}</div>
        }).pipe(
            Component.withContext(runtime.context)
        )

        const view = render(
            <runtime.context.Provider value={effectRuntime}>
                <Probe value="first" />
            </runtime.context.Provider>
        )

        await screen.findByText("first")
        vi.useFakeTimers()

        view.rerender(
            <runtime.context.Provider value={effectRuntime}>
                <Probe value="second" />
            </runtime.context.Provider>
        )

        expect(screen.getByText("second")).toBeTruthy()
        expect(cleanup).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(19)
        expect(cleanup).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(1)
        expect(cleanup).toHaveBeenCalledWith("first")

        view.unmount()
        await vi.advanceTimersByTimeAsync(20)
        expect(cleanup).toHaveBeenCalledWith("second")
        vi.useRealTimers()
        await runtime.runtime.dispose()
    })

    it("does not remount a component when only nonReactiveTags change", async () => {
        const mounts = vi.fn()
        const unmounts = vi.fn()
        const runtime = ReactRuntime.make(Layer.empty)
        const effectRuntime = await runtime.runtime.context()

        const SubComponent = Component.makeUntraced("NonReactiveSubComponent")(function*() {
            const service = yield* ValueService
            const [count, setCount] = React.useState(0)

            yield* Component.useOnMount(() => Effect.gen(function*() {
                yield* Effect.sync(() => mounts())
                yield* Effect.addFinalizer(() => Effect.sync(() => unmounts()))
            }))

            return <button type="button" onClick={() => setCount(value => value + 1)}>{`${service.value}:${count}`}</button>
        }).pipe(
            Component.withOptions({
                nonReactiveTags: [...Component.defaultOptions.nonReactiveTags, ValueService],
            })
        )

        const Parent = Component.makeUntraced("NonReactiveParent")(function*(props: { readonly value: string }) {
            const serviceLayer = React.useMemo(
                () => Layer.succeed(ValueService, { value: props.value }),
                [props.value],
            )
            const context = yield* Component.useLayer(serviceLayer, {
                finalizerExecutionDebounce: 0,
            })
            const Child = yield* Effect.provide(SubComponent.use, context)

            return <Child />
        }).pipe(
            Component.withContext(runtime.context)
        )

        const view = render(
            <runtime.context.Provider value={effectRuntime}>
                <Parent value="first" />
            </runtime.context.Provider>
        )

        await screen.findByText("first:0")
        const initialMounts = mounts.mock.calls.length
        expect(initialMounts).toBeGreaterThan(0)
        expect(unmounts).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole("button", { name: "first:0" }))
        await screen.findByText("first:1")

        view.rerender(
            <runtime.context.Provider value={effectRuntime}>
                <Parent value="second" />
            </runtime.context.Provider>
        )

        await screen.findByText("second:1")
        expect(mounts).toHaveBeenCalledTimes(initialMounts)
        expect(unmounts).not.toHaveBeenCalled()

        view.unmount()
        await waitFor(() => expect(unmounts).toHaveBeenCalledTimes(1))
        await runtime.runtime.dispose()
    })

    it("does not commit effects or retain registered scopes for a discarded Suspense render", async () => {
        const setup = vi.fn()
        const runtime = ReactRuntime.make(Layer.empty)
        const effectRuntime = await runtime.runtime.context()
        const scopeRegistry = Context.get(effectRuntime, ScopeRegistry.ScopeRegistry)
        const pending = new Promise<void>(() => {})

        const Probe = Component.makeUntraced("DiscardedSuspenseProbe")(function*() {
            yield* Component.useReactEffect(() => Effect.sync(setup), [])
            React.use(pending)
            return <div>committed</div>
        }).pipe(
            Component.withOptions({ scopeCommitTimeout: "10 millis" }),
            Component.withContext(runtime.context)
        )

        let view!: ReturnType<typeof render>
        await act(async () => {
            view = render(
                <React.Suspense fallback={<div>fallback</div>}>
                    <runtime.context.Provider value={effectRuntime}>
                        <Probe />
                    </runtime.context.Provider>
                </React.Suspense>
            )
        })

        try {
            await screen.findByText("fallback")
            expect(setup).not.toHaveBeenCalled()
            await waitFor(() => expect(HashMap.size(Effect.runSync(SubscriptionRef.get(scopeRegistry.ref)))).toBe(0))
        }
        finally {
            view.unmount()
            await runtime.runtime.dispose()
        }
    })

    it("keeps committed scopes alive without heartbeats", async () => {
        const acquisitions = vi.fn()
        const releases = vi.fn()
        const runtime = ReactRuntime.make(Layer.empty)
        const effectRuntime = await runtime.runtime.context()
        const scopeRegistry = Context.get(effectRuntime, ScopeRegistry.ScopeRegistry)

        const Probe = Component.makeUntraced("CommittedScopeProbe")(function*() {
            yield* Component.useOnMount(() => Effect.gen(function*() {
                yield* Effect.sync(acquisitions)
                yield* Effect.addFinalizer(() => Effect.sync(releases))
            }))

            return <div>committed</div>
        }).pipe(
            Component.withOptions({
                finalizerExecutionDebounce: "10 millis",
                scopeCommitTimeout: "10 millis",
            }),
            Component.withContext(runtime.context),
        )

        const view = render(
            <runtime.context.Provider value={effectRuntime}>
                <Probe />
            </runtime.context.Provider>
        )

        await screen.findByText("committed")
        await waitFor(() => expect(releases).toHaveBeenCalledTimes(acquisitions.mock.calls.length - 1))
        await new Promise(resolve => setTimeout(resolve, 30))

        expect(HashMap.size(Effect.runSync(SubscriptionRef.get(scopeRegistry.ref)))).toBe(1)
        expect(releases).toHaveBeenCalledTimes(acquisitions.mock.calls.length - 1)

        view.unmount()
        await waitFor(() => expect(releases).toHaveBeenCalledTimes(acquisitions.mock.calls.length))
        await waitFor(() => expect(HashMap.size(Effect.runSync(SubscriptionRef.get(scopeRegistry.ref)))).toBe(0))
        await runtime.runtime.dispose()
    })

    it("does not expire a scope while a descendant is suspended past the finalizer debounce", async () => {
        const runtime = ReactRuntime.make(Layer.empty)
        let resolve!: () => void
        const pending = new Promise<void>(complete => {
            resolve = complete
        })

        const Suspended = () => {
            React.use(pending)
            return <div>committed</div>
        }

        let view!: ReturnType<typeof render>
        await act(async () => {
            view = render(
                <ReactRuntime.Provider runtime={runtime} fallback={<div>fallback</div>}>
                    <Suspended />
                </ReactRuntime.Provider>
            )
        })

        try {
            await screen.findByText("fallback")
            await new Promise(resolve => setTimeout(resolve, 150))
            await act(async () => {
                resolve()
                await pending
            })
            await screen.findByText("committed")
        }
        finally {
            view.unmount()
            await runtime.runtime.dispose()
        }
    })

    it("clears ScopeRegistry after a suspended render retries, commits, and unmounts", async () => {
        const lifecycle = vi.fn<(message: string) => void>()
        const runtime = ReactRuntime.make(Layer.empty)
        const effectRuntime = await runtime.runtime.context()
        const scopeRegistry = Context.get(effectRuntime, ScopeRegistry.ScopeRegistry)
        let resolve!: () => void
        const pending = new Promise<void>(complete => {
            resolve = complete
        })

        const Probe = Component.makeUntraced("RetriedSuspenseProbe")(function*() {
            React.use(pending)
            yield* Component.useReactEffect(() => Effect.gen(function*() {
                yield* Effect.sync(() => lifecycle("mount"))
                yield* Effect.addFinalizer(() => Effect.sync(() => lifecycle("cleanup")))
            }), [])
            return <div>committed</div>
        }).pipe(
            Component.withOptions({ scopeCommitTimeout: "10 millis" }),
            Component.withContext(runtime.context)
        )

        let view!: ReturnType<typeof render>
        await act(async () => {
            view = render(
                <React.Suspense fallback={<div>fallback</div>}>
                    <runtime.context.Provider value={effectRuntime}>
                        <Probe />
                    </runtime.context.Provider>
                </React.Suspense>
            )
        })

        try {
            await screen.findByText("fallback")
            await act(async () => {
                resolve()
                await pending
            })
            await screen.findByText("committed")
            await waitFor(() => expect(lifecycle).toHaveBeenCalledWith("mount"))

            view.unmount()
            await waitFor(() => expect(HashMap.size(Effect.runSync(SubscriptionRef.get(scopeRegistry.ref)))).toBe(0))
            expect(lifecycle.mock.calls.filter(([message]) => message === "mount")).toHaveLength(2)
            expect(lifecycle.mock.calls.filter(([message]) => message === "cleanup")).toHaveLength(2)
        }
        finally {
            view.unmount()
            await runtime.runtime.dispose()
        }
    })

    it("refreshes a registered body while preserving or resetting local state", async () => {
        const runtime = ReactRuntime.make(Layer.empty)
        const effectRuntime = await runtime.runtime.context()

        const makeProbe = (label: string) => Component.makeUntraced("RefreshProbe")(function*() {
            const [count, setCount] = React.useState(0)
            return <button type="button" onClick={() => setCount(value => value + 1)}>{label}:{count}</button>
        })
        const original = makeProbe("old")
        const cell = Refreshable.makeCell(original, "hooks", false)
        Refreshable.attach(original, cell)

        const Probe = Component.withContext(original, runtime.context)
        const view = render(
            <runtime.context.Provider value={effectRuntime}>
                <Probe />
            </runtime.context.Provider>
        )

        fireEvent.click(await screen.findByRole("button"))
        expect(screen.getByRole("button").textContent).toBe("old:1")

        await act(async () => {
            cell.update(makeProbe("compatible"), "hooks", false)
            await Promise.resolve()
        })
        expect(screen.getByRole("button").textContent).toBe("compatible:1")

        await act(async () => {
            cell.update(makeProbe("reset"), "changed-hooks", false)
            await Promise.resolve()
        })
        expect(screen.getByRole("button").textContent).toBe("reset:0")

        view.unmount()
        await runtime.runtime.dispose()
    })
})
