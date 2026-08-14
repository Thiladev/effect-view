import { Effect, PubSub, type Scope } from "effect"
import type * as React from "react"
import * as Component from "./Component.js"


export * from "effect/PubSub"

export const useFromReactiveValues = Effect.fnUntraced(function* <const A extends React.DependencyList>(
    values: A
): Effect.fn.Return<PubSub.PubSub<A>, never, Scope.Scope> {
    const pubsub = yield* Component.useOnMount(() => Effect.acquireRelease(PubSub.unbounded<A>(), PubSub.shutdown))
    yield* Component.useReactEffect(() => Effect.flatMap(
        PubSub.isShutdown(pubsub),
        shutdown => shutdown ? Effect.void : Effect.asVoid(PubSub.publish(pubsub, values)),
    ), values)
    return pubsub
})
