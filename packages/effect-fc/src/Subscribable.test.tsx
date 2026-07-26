import { render, screen, waitFor } from "@testing-library/react"
import { Effect, Fiber, Layer, Stream, SubscriptionRef } from "effect"
import { Lens } from "effect-lens"
import { describe, expect, it } from "vitest"
import * as Component from "./Component.js"
import * as ReactRuntime from "./ReactRuntime.js"
import * as Subscribable from "./Subscribable.js"


const makeRuntime = async () => {
    const runtime = ReactRuntime.make(Layer.empty)
    const effectRuntime = await Effect.runPromise(runtime.runtime.runtimeEffect)

    return {
        runtime,
        effectRuntime,
        dispose: () => Effect.runPromise(runtime.runtime.disposeEffect),
    }
}

describe("Subscribable", () => {
    it("zipLatestAll reads current values from all inputs", async () => {
        const leftRef = await Effect.runPromise(SubscriptionRef.make(1))
        const rightRef = await Effect.runPromise(SubscriptionRef.make("a"))
        const left = Lens.fromSubscriptionRef(leftRef)
        const right = Lens.fromSubscriptionRef(rightRef)

        const zipped = Subscribable.zipLatestAll(left, right)

        expect(await Effect.runPromise(zipped.get)).toEqual([1, "a"])
    })

    it("zipLatestAll emits updates when any input changes", async () => {
        const leftRef = await Effect.runPromise(SubscriptionRef.make(1))
        const rightRef = await Effect.runPromise(SubscriptionRef.make("a"))
        const left = Lens.fromSubscriptionRef(leftRef)
        const right = Lens.fromSubscriptionRef(rightRef)

        const zipped = Subscribable.zipLatestAll(left, right)
        const values: Array<readonly [number, string]> = []

        const collector = Effect.runFork(Effect.scoped(zipped.changes.pipe(
            Stream.runForEach(value => Effect.sync(() => {
                values.push(value as readonly [number, string])
            })),
        )))

        await Effect.runPromise(Lens.set(left, 2))
        await waitFor(() => expect(values).toContainEqual([2, "a"]))

        await Effect.runPromise(Lens.set(right, "b"))
        await waitFor(() => expect(values).toContainEqual([2, "b"]))

        Fiber.interruptFork(collector)
    })

    it("useAll returns the latest values and rerenders when any input changes", async () => {
        const { runtime, effectRuntime, dispose } = await makeRuntime()
        const countRef = await Effect.runPromise(SubscriptionRef.make(1))
        const labelRef = await Effect.runPromise(SubscriptionRef.make("a"))
        const count = Lens.fromSubscriptionRef(countRef)
        const label = Lens.fromSubscriptionRef(labelRef)

        const Probe = Component.makeUntraced("SubscribableUseAllProbe")(function*() {
            const [currentCount, currentLabel] = yield* Subscribable.useAll([count, label])

            return <div>{`${currentCount}:${currentLabel}`}</div>
        }).pipe(
            Component.withRuntime(runtime.context)
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

        const Probe = Component.makeUntraced("SubscribableUseAllEquivalenceProbe")(function*() {
            const [currentItem, currentFlag] = yield* Subscribable.useAll([item, flag], {
                equivalence: ([selfItem, selfFlag], [thatItem, thatFlag]) =>
                    selfItem.id === thatItem.id && selfFlag === thatFlag,
            })

            return <div>{`${currentItem.label}:${currentFlag ? "on" : "off"}`}</div>
        }).pipe(
            Component.withRuntime(runtime.context)
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
