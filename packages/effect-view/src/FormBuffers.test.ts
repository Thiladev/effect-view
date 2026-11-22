import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import * as FormBuffers from "./FormBuffers.js"


describe("FormBuffers", () => {
    it("flushes the registered inputs, optionally of a subtree, until their scope is closed", async () => {
        const calls: string[] = []
        await Effect.runPromise(Effect.gen(function*() {
            const buffers = yield* FormBuffers.make
            yield* buffers.register(["a"], Effect.sync(() => { calls.push("a") }))
            yield* buffers.register(["a", "b"], Effect.sync(() => { calls.push("a.b") }))
            yield* buffers.register(["c"], Effect.sync(() => { calls.push("c") }))

            yield* buffers.flush()
            expect(calls).toEqual(["a", "a.b", "c"])

            calls.length = 0
            yield* buffers.flush(["a"])
            expect(calls).toEqual(["a", "a.b"])

            yield* Effect.scoped(buffers.register(["d"], Effect.sync(() => { calls.push("d") })))
            calls.length = 0
            yield* buffers.flush()
            expect(calls).toEqual(["a", "a.b", "c"])
        }).pipe(Effect.scoped))
    })
})
