import { Effect, Layer, Option, Schema, SchemaGetter, type Scope } from "effect"
import { describe, expect, it } from "vitest"
import * as AppConnectivity from "./AppConnectivity.js"
import * as AppFocus from "./AppFocus.js"
import * as Lens from "./Lens.js"
import * as MutationForm from "./MutationForm.js"
import * as QueryClient from "./QueryClient.js"


const runTest = <A, E>(effect: Effect.Effect<A, E, QueryClient.QueryClient | Scope.Scope>) =>
    Effect.runPromise(Effect.scoped(effect.pipe(
        Effect.provide(QueryClient.layer.pipe(
            Layer.provide(Layer.mergeAll(AppConnectivity.layerDummy, AppFocus.layerDummy)),
        )),
    )))

/** An email whose validation takes a while, like one that asks a server. */
const SlowEmail = Schema.String.pipe(Schema.decode({
    decode: SchemaGetter.checkEffect((email: string) => Effect.sleep("100 millis").pipe(
        Effect.as(/^[^\s@]+@[^\s@]+$/.test(email) ? true : "Enter a valid email address"),
    )),
    encode: SchemaGetter.passthrough(),
}))

describe("MutationForm.submit", () => {
    it("submits the current encoded value while its validation is still running", () => runTest(Effect.gen(function*() {
        const submitted: string[] = []
        const form = yield* MutationForm.make({
            schema: Schema.Struct({ email: SlowEmail }),
            initialEncodedValue: { email: "" },
            f: ([value]) => Effect.sync(() => { submitted.push(value.email) }),
        }).pipe(MutationForm.thenRun)
        yield* Effect.sleep("200 millis")

        yield* Effect.forkScoped(Lens.set(form.encodedValue, { email: "a@b" }))
        yield* Effect.sleep("20 millis")

        expect(Option.isSome(yield* form.submit)).toBe(true)
        expect(submitted).toEqual(["a@b"])
    })))
})
