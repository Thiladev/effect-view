import { Effect, Equivalence, Stream } from "effect"
import { Subscribable } from "effect-lens"
import * as React from "react"
import * as Component from "./Component.js"


export * from "effect-lens/Subscribable"

export const zipLatestAll = <const T extends readonly Subscribable.Subscribable<any, any, any>[]>(
    ...elements: T
): Subscribable.Subscribable<
    [T[number]] extends [never]
        ? never
        : { [K in keyof T]: T[K] extends Subscribable.Subscribable<infer A, infer _E, infer _R> ? A : never },
    [T[number]] extends [never] ? never : T[number] extends Subscribable.Subscribable<infer _A, infer E, infer _R> ? E : never,
    [T[number]] extends [never] ? never : T[number] extends Subscribable.Subscribable<infer _A, infer _E, infer R> ? R : never
> => Subscribable.make({
    get: Effect.all(elements.map(v => v.get)),
    changes: Stream.zipLatestAll(...elements.map(v => v.changes)),
}) as any

export declare namespace useSubscribables {
    export type Success<T extends readonly Subscribable.Subscribable<any, any, any>[]> = [T[number]] extends [never]
        ? never
        : { [K in keyof T]: T[K] extends Subscribable.Subscribable<infer A, infer _E, infer _R> ? A : never }

    export interface Options<A> {
        readonly equivalence?: Equivalence.Equivalence<A>
    }
}

export const useSubscribables = Effect.fnUntraced(function* <const T extends readonly Subscribable.Subscribable<any, any, any>[]>(
    elements: T,
    options?: useSubscribables.Options<useSubscribables.Success<NoInfer<T>>>,
): Effect.fn.Return<
    useSubscribables.Success<T>,
    [T[number]] extends [never] ? never : T[number] extends Subscribable.Subscribable<infer _A, infer E, infer _R> ? E : never,
    [T[number]] extends [never] ? never : T[number] extends Subscribable.Subscribable<infer _A, infer _E, infer R> ? R : never
> {
    const [reactStateValue, setReactStateValue] = React.useState(
        yield* Component.useOnMount(() => Effect.all(elements.map(v => v.get)))
    )

    yield* Component.useReactEffect(() => Stream.zipLatestAll(...elements.map(ref => ref.changes)).pipe(
        Stream.changesWith((options?.equivalence as Equivalence.Equivalence<any[]> | undefined) ?? Equivalence.array(Equivalence.strict())),
        Stream.runForEach(v =>
            Effect.sync(() => setReactStateValue(v))
        ),
        Effect.forkScoped,
    ), elements)

    return reactStateValue as any
})
