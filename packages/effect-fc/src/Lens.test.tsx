import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Effect, Layer, SubscriptionRef } from "effect"
import * as React from "react"
import { describe, expect, it } from "vitest"
import * as Component from "./Component.js"
import * as Lens from "./Lens.js"
import * as ReactRuntime from "./ReactRuntime.js"


const makeRuntime = async () => {
    const runtime = ReactRuntime.make(Layer.empty)
    const effectRuntime = await Effect.runPromise(runtime.runtime.runtimeEffect)

    return {
        runtime,
        effectRuntime,
        dispose: () => Effect.runPromise(runtime.runtime.disposeEffect),
    }
}

const expectDefined = <A,>(value: A | undefined): A => {
    if (value === undefined)
        throw new Error("Expected value to be defined")
    return value
}

describe("Lens", () => {
    it("useState stays in sync with lens updates in both directions", async () => {
        const { runtime, effectRuntime, dispose } = await makeRuntime()
        const ref = await Effect.runPromise(SubscriptionRef.make(0))
        const lens = Lens.fromSubscriptionRef(ref)

        const Probe = Component.makeUntraced("LensUseStateProbe")(function*() {
            const [value, setValue] = yield* Lens.useState(lens)

            return (
                <>
                    <div>{value}</div>
                    <button type="button" onClick={() => setValue(previous => previous + 1)}>increment</button>
                </>
            )
        }).pipe(
            Component.withRuntime(runtime.context)
        )

        const view = render(
            <runtime.context.Provider value={effectRuntime}>
                <Probe />
            </runtime.context.Provider>
        )

        await screen.findByText("0")

        await Effect.runPromise(Lens.set(lens, 5))
        await screen.findByText("5")

        fireEvent.click(screen.getByRole("button", { name: "increment" }))
        await screen.findByText("6")
        expect(await Effect.runPromise(Lens.get(lens))).toBe(6)

        view.unmount()
        await dispose()
    })

    it("useState respects the provided equivalence when subscribing to lens changes", async () => {
        const { runtime, effectRuntime, dispose } = await makeRuntime()
        const ref = await Effect.runPromise(SubscriptionRef.make({ id: 1, label: "first" }))
        const lens = Lens.fromSubscriptionRef(ref)

        const Probe = Component.makeUntraced("LensUseStateEquivalenceProbe")(function*() {
            const [value] = yield* Lens.useState(lens, {
                equivalence: (self, that) => self.id === that.id,
            })

            return <div>{value.label}</div>
        }).pipe(
            Component.withRuntime(runtime.context)
        )

        const view = render(
            <runtime.context.Provider value={effectRuntime}>
                <Probe />
            </runtime.context.Provider>
        )

        await screen.findByText("first")

        await Effect.runPromise(Lens.set(lens, { id: 1, label: "ignored" }))
        await waitFor(() => expect(screen.getByText("first")).toBeTruthy())
        expect(screen.queryByText("ignored")).toBeNull()

        await Effect.runPromise(Lens.set(lens, { id: 2, label: "updated" }))
        await screen.findByText("updated")

        view.unmount()
        await dispose()
    })

    it("useFromReactState writes React state changes into the returned lens", async () => {
        const { runtime, effectRuntime, dispose } = await makeRuntime()
        let lens: Lens.Lens<string, never, never, never, never> | undefined

        const Probe = Component.makeUntraced("LensUseFromReactStateProbe")(function*() {
            const [value, setValue] = React.useState("hello")
            const reactLens = yield* Lens.useFromReactState([value, setValue])

            yield* Component.useOnMount(() => Effect.sync(() => {
                lens = reactLens
            }))

            return <button type="button" onClick={() => setValue(previous => `${previous}!`)}>{value}</button>
        }).pipe(
            Component.withRuntime(runtime.context)
        )

        const view = render(
            <runtime.context.Provider value={effectRuntime}>
                <Probe />
            </runtime.context.Provider>
        )

        await screen.findByText("hello")
        await waitFor(() => expect(lens).toBeDefined())

        fireEvent.click(screen.getByRole("button", { name: "hello" }))
        await screen.findByText("hello!")
        await waitFor(async () => expect(await Effect.runPromise(Lens.get(expectDefined(lens)))).toBe("hello!"))

        view.unmount()
        await dispose()
    })

    it("useFromReactState respects equivalence when lens updates flow back into React state", async () => {
        const { runtime, effectRuntime, dispose } = await makeRuntime()
        let lens: Lens.Lens<{ readonly id: number; readonly label: string }, never, never, never, never> | undefined

        const Probe = Component.makeUntraced("LensUseFromReactStateEquivalenceProbe")(function*() {
            const [value, setValue] = React.useState({ id: 1, label: "first" })
            const reactLens = yield* Lens.useFromReactState([value, setValue], {
                equivalence: (self, that) => self.id === that.id,
            })

            yield* Component.useOnMount(() => Effect.sync(() => {
                lens = reactLens
            }))

            return <div>{value.label}</div>
        }).pipe(
            Component.withRuntime(runtime.context)
        )

        const view = render(
            <runtime.context.Provider value={effectRuntime}>
                <Probe />
            </runtime.context.Provider>
        )

        await screen.findByText("first")
        await waitFor(() => expect(lens).toBeDefined())

        await Effect.runPromise(Lens.set(expectDefined(lens), { id: 1, label: "ignored" }))
        await waitFor(() => expect(screen.getByText("first")).toBeTruthy())
        expect(screen.queryByText("ignored")).toBeNull()

        await Effect.runPromise(Lens.set(expectDefined(lens), { id: 2, label: "updated" }))
        await screen.findByText("updated")

        view.unmount()
        await dispose()
    })
})
