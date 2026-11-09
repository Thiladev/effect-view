import { Console, Context, Effect, Layer, SubscriptionRef } from "effect"
import { Lens } from "effect-view"
import { runtime } from "@/runtime"


export class CurrentUser extends Context.Service<CurrentUser, {
    readonly name: Lens.Lens<string>
}>()("CurrentUser") {
    static readonly layer = Layer.effect(CurrentUser, Effect.gen(function*() {
        yield* Console.log("CurrentUser built")
        yield* Effect.addFinalizer(() => Console.log("CurrentUser released"))

        return {
            name: Lens.fromSubscriptionRef(yield* SubscriptionRef.make("Ada")),
        }
    }))
}

// The services of the `/user` routes: built when entering `/user`, released when leaving it.
export const userRuntime = runtime.extend(CurrentUser.layer)
