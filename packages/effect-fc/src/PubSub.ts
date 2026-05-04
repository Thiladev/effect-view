import { Effect, PubSub, type Scope } from "effect"
import type * as React from "react"
import * as Component from "./Component.js"


export const useFromReactiveValues = Effect.fnUntraced(function* <const A extends React.DependencyList>(
    values: A
): Effect.fn.Return<PubSub.PubSub<A>, never, Scope.Scope> {
    const pubsub = yield* Component.useOnMount(() => Effect.acquireRelease(PubSub.unbounded<A>(), PubSub.shutdown))
    yield* Component.useReactEffect(() => Effect.unlessEffect(PubSub.publish(pubsub, values), PubSub.isShutdown(pubsub)), values)
    return pubsub
})

export * from "effect/PubSub"
