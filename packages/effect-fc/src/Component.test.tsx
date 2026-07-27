import { render, screen, waitFor } from "@testing-library/react"
import { Context, Effect, Layer } from "effect"
import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import * as Component from "./Component.js"
import * as ReactRuntime from "./ReactRuntime.js"


class ValueService extends Context.Tag("ValueService")<ValueService, { readonly value: string }>() {}

afterEach(() => {
    vi.useRealTimers()
})

describe("Component", () => {
    it("runs useOnMount only once across rerenders", async () => {
        const onMount = vi.fn(() => Effect.succeed("mounted"))
        const runtime = ReactRuntime.make(Layer.empty)
        const effectRuntime = await Effect.runPromise(runtime.runtime.runtimeEffect)

        const Probe = Component.makeUntraced("UseOnMountProbe")(function*() {
            const value = yield* Component.useOnMount(onMount)
            return <div>{value}</div>
        }).pipe(
            Component.withRuntime(runtime.context)
        )

        const view = render(
            <runtime.context.Provider value={effectRuntime}>
                <Probe />
            </runtime.context.Provider>
        )

        await screen.findByText("mounted")
        expect(onMount).toHaveBeenCalledTimes(1)

        view.rerender(
            <runtime.context.Provider value={effectRuntime}>
                <Probe />
            </runtime.context.Provider>
        )
        expect(await screen.findByText("mounted")).toBeTruthy()
        expect(onMount).toHaveBeenCalledTimes(1)

        view.unmount()
        await Effect.runPromise(runtime.runtime.disposeEffect)
    })

    it("recomputes useOnChange only when dependencies change", async () => {
        const onChange = vi.fn((value: number) => Effect.succeed(`value:${value}`))
        const runtime = ReactRuntime.make(Layer.empty)
        const effectRuntime = await Effect.runPromise(runtime.runtime.runtimeEffect)

        const Probe = Component.makeUntraced("UseOnChangeProbe")(function*(props: { readonly value: number }) {
            const result = yield* Component.useOnChange(() => onChange(props.value), [props.value], {
                finalizerExecutionDebounce: 0,
            })

            return <div>{result}</div>
        }).pipe(
            Component.withRuntime(runtime.context)
        )

        const view = render(
            <runtime.context.Provider value={effectRuntime}>
                <Probe value={1} />
            </runtime.context.Provider>
        )

        await screen.findByText("value:1")
        expect(onChange).toHaveBeenCalledTimes(1)

        view.rerender(
            <runtime.context.Provider value={effectRuntime}>
                <Probe value={1} />
            </runtime.context.Provider>
        )

        expect(await screen.findByText("value:1")).toBeTruthy()
        expect(onChange).toHaveBeenCalledTimes(1)

        view.rerender(
            <runtime.context.Provider value={effectRuntime}>
                <Probe value={2} />
            </runtime.context.Provider>
        )

        await screen.findByText("value:2")
        expect(onChange).toHaveBeenCalledTimes(2)

        view.unmount()
        await Effect.runPromise(runtime.runtime.disposeEffect)
    })

    it("closes the previous scope on dependency changes and unmount", async () => {
        const cleanup = vi.fn()
        const runtime = ReactRuntime.make(Layer.empty)
        const effectRuntime = await Effect.runPromise(runtime.runtime.runtimeEffect)

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
            Component.withRuntime(runtime.context)
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
        await Effect.runPromise(runtime.runtime.disposeEffect)
    })

    it("runs useReactEffect setup and cleanup when dependencies change", async () => {
        const lifecycle = vi.fn<(message: string) => void>()
        const runtime = ReactRuntime.make(Layer.empty)
        const effectRuntime = await Effect.runPromise(runtime.runtime.runtimeEffect)

        const Probe = Component.makeUntraced("UseReactEffectProbe")(function*(props: { readonly value: string }) {
            yield* Component.useReactEffect(() =>
                Effect.gen(function*() {
                    yield* Effect.sync(() => lifecycle(`mount:${props.value}`))
                    yield* Effect.addFinalizer(() => Effect.sync(() => lifecycle(`cleanup:${props.value}`)))
                }),
            [props.value])

            return <div>{props.value}</div>
        }).pipe(
            Component.withRuntime(runtime.context)
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
            "mount:second",
            "cleanup:second",
        ])
        await Effect.runPromise(runtime.runtime.disposeEffect)
    })

    it("keeps useCallbackSync stable until dependencies change", async () => {
        const runtime = ReactRuntime.make(Layer.empty)
        const effectRuntime = await Effect.runPromise(runtime.runtime.runtimeEffect)
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
            Component.withRuntime(runtime.context)
        )

        const view = render(
            <runtime.context.Provider value={effectRuntime}>
                <Probe prefix="a" />
            </runtime.context.Provider>
        )

        await screen.findByText("a:1")
        expect(seenCallbacks).toHaveLength(2)
        expect(seenCallbacks[0]).toBe(seenCallbacks[1])
        expect(seenCallbacks[0]?.(2)).toBe("a:2")

        view.rerender(
            <runtime.context.Provider value={effectRuntime}>
                <Probe prefix="a" />
            </runtime.context.Provider>
        )

        await screen.findByText("a:1")
        expect(seenCallbacks).toHaveLength(2)

        view.rerender(
            <runtime.context.Provider value={effectRuntime}>
                <Probe prefix="b" />
            </runtime.context.Provider>
        )

        await screen.findByText("b:1")
        await waitFor(() => expect(seenCallbacks).toHaveLength(3))
        expect(seenCallbacks[2]).not.toBe(seenCallbacks[1])
        expect(seenCallbacks[2]?.(2)).toBe("b:2")

        view.unmount()
        await Effect.runPromise(runtime.runtime.disposeEffect)
    })

    it("delays cleanup according to finalizerExecutionDebounce", async () => {
        const cleanup = vi.fn()
        const runtime = ReactRuntime.make(Layer.empty)
        const effectRuntime = await Effect.runPromise(runtime.runtime.runtimeEffect)

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
            Component.withRuntime(runtime.context)
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
        await Effect.runPromise(runtime.runtime.disposeEffect)
    })

    it("does not remount a component when only nonReactiveTags change", async () => {
        const mounts = vi.fn()
        const unmounts = vi.fn()
        const runtime = ReactRuntime.make(Layer.empty)
        const effectRuntime = await Effect.runPromise(runtime.runtime.runtimeEffect)

        const SubComponent = Component.makeUntraced("NonReactiveSubComponent")(function*() {
            const service = yield* ValueService

            yield* Component.useOnMount(() => Effect.gen(function*() {
                yield* Effect.sync(() => mounts())
                yield* Effect.addFinalizer(() => Effect.sync(() => unmounts()))
            }))

            return <div>{service.value}</div>
        }).pipe(
            Component.withOptions({ nonReactiveTags: [ValueService] })
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
            Component.withRuntime(runtime.context)
        )

        const view = render(
            <runtime.context.Provider value={effectRuntime}>
                <Parent value="first" />
            </runtime.context.Provider>
        )

        await screen.findByText("first")
        expect(mounts).toHaveBeenCalledTimes(1)
        expect(unmounts).not.toHaveBeenCalled()

        view.rerender(
            <runtime.context.Provider value={effectRuntime}>
                <Parent value="second" />
            </runtime.context.Provider>
        )

        await screen.findByText("second")
        expect(mounts).toHaveBeenCalledTimes(1)
        expect(unmounts).not.toHaveBeenCalled()

        view.unmount()
        await waitFor(() => expect(unmounts).toHaveBeenCalledTimes(1))
        await Effect.runPromise(runtime.runtime.disposeEffect)
    })
})
