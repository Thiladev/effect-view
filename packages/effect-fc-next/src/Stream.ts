import { Effect, Equivalence, Option, Stream } from "effect"
import * as React from "react"
import * as Component from "./Component.js"


export * from "effect/Stream"

export const use: {
    <A, E, R>(
        stream: Stream.Stream<A, E, R>
    ): Effect.Effect<Option.Option<A>, never, R>
    <A extends NonNullable<unknown>, E, R>(
        stream: Stream.Stream<A, E, R>,
        initialValue: A,
    ): Effect.Effect<Option.Some<A>, never, R>
} = Effect.fnUntraced(function* <A extends NonNullable<unknown>, E, R>(
    stream: Stream.Stream<A, E, R>,
    initialValue?: A,
) {
    const [reactStateValue, setReactStateValue] = React.useState(() => initialValue
        ? Option.some(initialValue)
        : Option.none()
    )

    yield* Component.useReactEffect(() => Effect.forkScoped(
        Stream.runForEach(
            Stream.changesWith(stream, Equivalence.strictEqual()),
            v => Effect.sync(() => setReactStateValue(Option.some(v))),
        )
    ), [stream])

    return reactStateValue as Option.Some<A>
})
