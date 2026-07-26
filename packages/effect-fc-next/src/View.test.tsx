import { render, screen, waitFor } from "@testing-library/react"
import { Effect, Layer, SubscriptionRef } from "effect"
import { Lens } from "effect-lens"
import { describe, expect, it } from "vitest"
import * as Component from "./Component.js"
import * as ReactRuntime from "./ReactRuntime.js"
import * as View from "./View.js"


const makeRuntime = async () => {
    const runtime = ReactRuntime.make(Layer.empty)
    const effectRuntime = await runtime.runtime.context()

    return {
        runtime,
        effectRuntime,
        dispose: () => runtime.runtime.dispose(),
    }
}

describe("View", () => {
    it("useAll returns the latest values and rerenders when any input changes", async () => {
        const { runtime, effectRuntime, dispose } = await makeRuntime()
        const countRef = await Effect.runPromise(SubscriptionRef.make(1))
        const labelRef = await Effect.runPromise(SubscriptionRef.make("a"))
        const count = Lens.fromSubscriptionRef(countRef)
        const label = Lens.fromSubscriptionRef(labelRef)

        const Probe = Component.makeUntraced("ViewUseAllProbe")(function*() {
            const [currentCount, currentLabel] = yield* View.useAll([count, label])

            return <div>{`${currentCount}:${currentLabel}`}</div>
        }).pipe(
            Component.withContext(runtime.context)
        )

        const view = render(
            <runtime.context.Provider value={effectRuntime}>
                <Probe />
            </runtime.context.Provider>
        )

        await screen.findByText("1:a")

        await Effect.runPromise(Lens.set(count, 2))
        await screen.findByText("2:a")

        await Effect.runPromise(Lens.set(label, "b"))
        await screen.findByText("2:b")

        view.unmount()
        await dispose()
    })

    it("useAll respects the provided equivalence when processing updates", async () => {
        const { runtime, effectRuntime, dispose } = await makeRuntime()
        const itemRef = await Effect.runPromise(SubscriptionRef.make({ id: 1, label: "first" }))
        const flagRef = await Effect.runPromise(SubscriptionRef.make(true))
        const item = Lens.fromSubscriptionRef(itemRef)
        const flag = Lens.fromSubscriptionRef(flagRef)

        const Probe = Component.makeUntraced("ViewUseAllEquivalenceProbe")(function*() {
            const [currentItem, currentFlag] = yield* View.useAll([item, flag], {
                equivalence: ([selfItem, selfFlag], [thatItem, thatFlag]) =>
                    selfItem.id === thatItem.id && selfFlag === thatFlag,
            })

            return <div>{`${currentItem.label}:${currentFlag ? "on" : "off"}`}</div>
        }).pipe(
            Component.withContext(runtime.context)
        )

        const view = render(
            <runtime.context.Provider value={effectRuntime}>
                <Probe />
            </runtime.context.Provider>
        )

        await screen.findByText("first:on")

        await Effect.runPromise(Lens.set(item, { id: 1, label: "ignored" }))
        await waitFor(() => expect(screen.getByText("first:on")).toBeTruthy())
        expect(screen.queryByText("ignored:on")).toBeNull()

        await Effect.runPromise(Lens.set(flag, false))
        await screen.findByText("ignored:off")

        await Effect.runPromise(Lens.set(item, { id: 2, label: "updated" }))
        await screen.findByText("updated:off")

        view.unmount()
        await dispose()
    })
})
