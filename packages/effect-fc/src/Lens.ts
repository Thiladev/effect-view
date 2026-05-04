import { Effect, Equivalence, Stream, SubscriptionRef } from "effect"
import { Lens } from "effect-lens"
import * as React from "react"
import * as Component from "./Component.js"
import * as SetStateAction from "./SetStateAction.js"


export * from "effect-lens/Lens"

export declare namespace useState {
    export interface Options<A> {
        readonly equivalence?: Equivalence.Equivalence<A>
    }
}

export const useState = Effect.fnUntraced(function* <A, ER, EW, RR, RW>(
    lens: Lens.Lens<A, ER, EW, RR, RW>,
    options?: useState.Options<NoInfer<A>>,
): Effect.fn.Return<readonly [A, React.Dispatch<React.SetStateAction<A>>], ER, RR | RW> {
    const [reactStateValue, setReactStateValue] = React.useState(yield* Component.useOnMount(() => Lens.get(lens)))

    yield* Component.useReactEffect(() => Effect.forkScoped(
        Stream.runForEach(
            Stream.changesWith(lens.changes, options?.equivalence ?? Equivalence.strict()),
            v => Effect.sync(() => setReactStateValue(v)),
        )
    ), [lens])

    const setValue = yield* Component.useCallbackSync(
        (setStateAction: React.SetStateAction<A>) => Effect.andThen(
            Lens.updateAndGet(lens, prevState => SetStateAction.value(setStateAction, prevState)),
            v => setReactStateValue(v),
        ),
        [lens],
    )

    return [reactStateValue, setValue]
})

export declare namespace useFromReactState {
    export interface Options<A> {
        readonly equivalence?: Equivalence.Equivalence<A>
    }
}

export const useFromReactState = Effect.fnUntraced(function* <A>(
    [value, setValue]: readonly [A, React.Dispatch<React.SetStateAction<A>>],
    options?: useFromReactState.Options<NoInfer<A>>,
): Effect.fn.Return<Lens.Lens<A, never, never, never, never>> {
    const lens = yield* Component.useOnMount(() => Effect.map(
        SubscriptionRef.make(value),
        Lens.fromSubscriptionRef,
    ))

    yield* Component.useReactEffect(() => Effect.forkScoped(Stream.runForEach(
        Stream.changesWith(lens.changes, options?.equivalence ?? Equivalence.strict()),
        v => Effect.sync(() => setValue(v)),
    )), [setValue])
    yield* Component.useReactEffect(() => Lens.set(lens, value), [value])

    return lens
})
