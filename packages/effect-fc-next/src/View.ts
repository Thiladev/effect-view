import { Effect, Equivalence, Stream } from "effect"
import { View } from "effect-lens"
import * as React from "react"
import * as Component from "./Component.js"


export * from "effect-lens/View"

export declare namespace useAll {
    export type Success<T extends readonly View.View<any, any, any>[]> = [T[number]] extends [never]
        ? never
        : { [K in keyof T]: T[K] extends View.View<infer A, infer _E, infer _R> ? A : never }

    export interface Options<A> {
        readonly equivalence?: Equivalence.Equivalence<A>
    }
}

export const useAll = Effect.fnUntraced(function* <const T extends readonly View.View<any, any, any>[]>(
    elements: T,
    options?: useAll.Options<useAll.Success<NoInfer<T>>>,
): Effect.fn.Return<
    useAll.Success<T>,
    [T[number]] extends [never] ? never : T[number] extends View.View<infer _A, infer E, infer _R> ? E : never,
    [T[number]] extends [never] ? never : T[number] extends View.View<infer _A, infer _E, infer R> ? R : never
> {
    const [reactStateValue, setReactStateValue] = React.useState(
        yield* Component.useOnMount(() => Effect.all(elements.map(View.get)))
    )

    yield* Component.useReactEffect(() => Stream.make(reactStateValue).pipe(
        Stream.concat(View.changes(View.zipLatestAll(...elements))),
        Stream.changesWith((options?.equivalence as Equivalence.Equivalence<any[]> | undefined) ?? Equivalence.Array(Equivalence.strictEqual())),
        Stream.drop(1),
        Stream.runForEach(v =>
            Effect.sync(() => setReactStateValue(v))
        ),
        Effect.forkScoped,
    ), elements)

    return reactStateValue as any
})
