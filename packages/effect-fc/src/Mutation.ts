import { type Context, Effect, Equal, type Fiber, Option, Pipeable, Predicate, type Scope, Stream, type Subscribable, SubscriptionRef } from "effect"
import * as Result from "./Result.js"


export const MutationTypeId: unique symbol = Symbol.for("@effect-fc/Mutation/Mutation")
export type MutationTypeId = typeof MutationTypeId

export interface Mutation<in out K extends Mutation.AnyKey, in out A, in out E = never, in out R = never, in out P = never>
extends Pipeable.Pipeable {
    readonly [MutationTypeId]: MutationTypeId

    readonly context: Context.Context<Scope.Scope | R>
    readonly f: (key: K) => Effect.Effect<A, E, R>
    readonly initialProgress: P

    readonly latestKey: Subscribable.Subscribable<Option.Option<K>>
    readonly fiber: Subscribable.Subscribable<Option.Option<Fiber.Fiber<A, E>>>
    readonly result: Subscribable.Subscribable<Result.Result<A, E, P>>
    readonly latestFinalResult: Subscribable.Subscribable<Option.Option<Result.Final<A, E, P>>>

    mutate(key: K): Effect.Effect<Result.Final<A, E, P>>
    mutateSubscribable(key: K): Effect.Effect<Subscribable.Subscribable<Result.Result<A, E, P>>>
}

export declare namespace Mutation {
    export type AnyKey = readonly any[]
}

export class MutationImpl<in out K extends Mutation.AnyKey, in out A, in out E = never, in out R = never, in out P = never>
extends Pipeable.Class() implements Mutation<K, A, E, R, P> {
    readonly [MutationTypeId]: MutationTypeId = MutationTypeId

    constructor(
        readonly context: Context.Context<Scope.Scope | R>,
        readonly f: (key: K) => Effect.Effect<A, E, R>,
        readonly initialProgress: P,

        readonly latestKey: SubscriptionRef.SubscriptionRef<Option.Option<K>>,
        readonly fiber: SubscriptionRef.SubscriptionRef<Option.Option<Fiber.Fiber<A, E>>>,
        readonly result: SubscriptionRef.SubscriptionRef<Result.Result<A, E, P>>,
        readonly latestFinalResult: SubscriptionRef.SubscriptionRef<Option.Option<Result.Final<A, E, P>>>,
    ) {
        super()
    }

    mutate(key: K): Effect.Effect<Result.Final<A, E, P>> {
        return SubscriptionRef.set(this.latestKey, Option.some(key)).pipe(
            Effect.andThen(this.start(key)),
            Effect.andThen(sub => this.watch(sub)),
            Effect.provide(this.context),
        )
    }
    mutateSubscribable(key: K): Effect.Effect<Subscribable.Subscribable<Result.Result<A, E, P>>> {
        return SubscriptionRef.set(this.latestKey, Option.some(key)).pipe(
            Effect.andThen(this.start(key)),
            Effect.tap(sub => Effect.forkScoped(this.watch(sub))),
            Effect.provide(this.context),
        )
    }

    start(key: K): Effect.Effect<
        Subscribable.Subscribable<Result.Result<A, E, P>>,
        never,
        Scope.Scope | R
    > {
        return this.latestFinalResult.pipe(
            Effect.andThen(initial => Result.unsafeForkEffect(
                Effect.onExit(this.f(key), () => Effect.andThen(
                    Effect.all([Effect.fiberId, this.fiber]),
                    ([currentFiberId, fiber]) => Option.match(fiber, {
                        onSome: v => Equal.equals(currentFiberId, v.id())
                            ? SubscriptionRef.set(this.fiber, Option.none())
                            : Effect.void,
                        onNone: () => Effect.void,
                    }),
                )),

                {
                    initial: Option.isSome(initial) ? Result.willFetch(initial.value) : Result.initial(),
                    initialProgress: this.initialProgress,
                } as Result.unsafeForkEffect.Options<A, E, P>,
            )),
            Effect.tap(([, fiber]) => SubscriptionRef.set(this.fiber, Option.some(fiber))),
            Effect.map(([sub]) => sub),
        )
    }

    watch(
        sub: Subscribable.Subscribable<Result.Result<A, E, P>>
    ): Effect.Effect<Result.Final<A, E, P>> {
        return sub.get.pipe(
            Effect.andThen(initial => Stream.runFoldEffect(
                sub.changes,
                initial,
                (_, result) => Effect.as(SubscriptionRef.set(this.result, result), result),
            ) as Effect.Effect<Result.Final<A, E, P>>),
            Effect.tap(result => SubscriptionRef.set(this.latestFinalResult, Option.some(result))),
        )
    }
}


export const isMutation = (u: unknown): u is Mutation<readonly unknown[], unknown, unknown, unknown, unknown> => Predicate.hasProperty(u, MutationTypeId)


export declare namespace make {
    export interface Options<K extends Mutation.AnyKey = never, A = void, E = never, R = never, P = never> {
        readonly f: (key: K) => Effect.Effect<A, E, Result.forkEffect.InputContext<R, NoInfer<P>>>
        readonly initialProgress?: P
    }
}

export const make = Effect.fnUntraced(function* <const K extends Mutation.AnyKey = never, A = void, E = never, R = never, P = never>(
    options: make.Options<K, A, E, R, P>
): Effect.fn.Return<
    Mutation<K, A, E, Result.forkEffect.OutputContext<R, P>, P>,
    never,
    Scope.Scope | Result.forkEffect.OutputContext<R, P>
> {
    return new MutationImpl(
        yield* Effect.context<Scope.Scope | Result.forkEffect.OutputContext<R, P>>(),
        options.f as any,
        options.initialProgress as P,

        yield* SubscriptionRef.make(Option.none<K>()),
        yield* SubscriptionRef.make(Option.none<Fiber.Fiber<A, E>>()),
        yield* SubscriptionRef.make(Result.initial<A, E, P>()),
        yield* SubscriptionRef.make(Option.none<Result.Final<A, E, P>>()),
    )
})
