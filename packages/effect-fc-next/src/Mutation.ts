import { type Context, Effect, Equal, Exit, type Fiber, Option, Pipeable, Predicate, type Scope, Stream, SubscriptionRef } from "effect"
import { AsyncResult } from "effect/unstable/reactivity"
import * as Lens from "./Lens.js"
import * as View from "./View.js"


export const MutationTypeId: unique symbol = Symbol.for("@effect-fc/Mutation/Mutation")
export type MutationTypeId = typeof MutationTypeId

export interface Mutation<in out K, out A, out E = never, in out R = never>
extends Pipeable.Pipeable {
    readonly [MutationTypeId]: MutationTypeId

    readonly context: Context.Context<Scope.Scope | R>
    readonly f: (key: K) => Effect.Effect<A, E, R>

    readonly latestKey: View.View<Option.Option<K>>
    readonly fiber: View.View<Option.Option<Fiber.Fiber<A, E>>>
    readonly state: View.View<AsyncResult.AsyncResult<A, E>>
    readonly latestFinalResult: View.View<Option.Option<AsyncResult.Success<A, E> | AsyncResult.Failure<A, E>>>

    mutate(key: K): Effect.Effect<AsyncResult.Success<A, E> | AsyncResult.Failure<A, E>>
    mutateView(key: K): Effect.Effect<View.View<AsyncResult.AsyncResult<A, E>>>
}

export const isMutation = (u: unknown): u is Mutation<unknown, unknown, unknown, unknown> => Predicate.hasProperty(u, MutationTypeId)


export class MutationImpl<in out K, in out A, in out E = never, in out R = never>
extends Pipeable.Class implements Mutation<K, A, E, R> {
    readonly [MutationTypeId]: MutationTypeId = MutationTypeId

    constructor(
        readonly context: Context.Context<Scope.Scope | R>,
        readonly f: (key: K) => Effect.Effect<A, E, R>,

        readonly latestKey: Lens.Lens<Option.Option<K>>,
        readonly fiber: Lens.Lens<Option.Option<Fiber.Fiber<A, E>>>,
        readonly state: Lens.Lens<AsyncResult.AsyncResult<A, E>>,
        readonly latestFinalResult: Lens.Lens<Option.Option<AsyncResult.Success<A, E> | AsyncResult.Failure<A, E>>>,
    ) {
        super()
    }

    mutate(key: K): Effect.Effect<AsyncResult.Success<A, E> | AsyncResult.Failure<A, E>> {
        return Lens.set(this.latestKey, Option.some(key)).pipe(
            Effect.andThen(this.start(key)),
            Effect.flatMap(state => this.watch(state)),
            Effect.provide(this.context),
        )
    }
    mutateView(key: K): Effect.Effect<View.View<AsyncResult.AsyncResult<A, E>>> {
        return Lens.set(this.latestKey, Option.some(key)).pipe(
            Effect.andThen(this.start(key)),
            Effect.tap(state => Effect.forkScoped(this.watch(state))),
            Effect.provide(this.context),
        )
    }

    start(key: K): Effect.Effect<
        View.View<AsyncResult.AsyncResult<A, E>>,
        never,
        Scope.Scope | R
    > {
        return Effect.gen({ self: this }, function*() {
            const previous = yield* Lens.get(this.latestFinalResult)
            const state = Lens.fromSubscriptionRef(yield* SubscriptionRef.make<AsyncResult.AsyncResult<A, E>>(
                Option.getOrElse(previous, () => AsyncResult.initial(false))
            ))

            const fiber = yield* Effect.forkScoped(Effect.andThen(
                Lens.update(state, AsyncResult.match({
                    onInitial: () => AsyncResult.initial(true),
                    onSuccess: v => AsyncResult.success(v.value, {
                        waiting: true,
                    }),
                    onFailure: v => AsyncResult.failure(v.cause, {
                        waiting: true,
                        previousSuccess: v.previousSuccess,
                    })
                })),

                Effect.onExit(this.f(key), exit => Lens.update(
                    state,
                    previous => Exit.match(exit, {
                        onSuccess: v => AsyncResult.success(v),
                        onFailure: c => AsyncResult.match(previous, {
                            onInitial: () => AsyncResult.failure(c),
                            onSuccess: v => AsyncResult.failure(c, {
                                previousSuccess: Option.some(v),
                            }),
                            onFailure: v => AsyncResult.failure(c, {
                                previousSuccess: v.previousSuccess,
                            })
                        }),
                    }),
                ).pipe(
                    Effect.andThen(Effect.all([
                        Effect.fiberId,
                        Lens.get(this.fiber),
                    ])),
                    Effect.flatMap(([fiberId, fiber]) => Option.match(fiber, {
                        onSome: v => Equal.equals(fiberId, v.id)
                            ? Lens.set(this.fiber, Option.none())
                            : Effect.void,
                        onNone: () => Effect.void,
                    })),
                )),
            ))

            yield* Lens.set(this.fiber, Option.some(fiber))
            return state
        })
    }

    watch(
        state: View.View<AsyncResult.AsyncResult<A, E>>
    ): Effect.Effect<AsyncResult.Success<A, E> | AsyncResult.Failure<A, E>> {
        return View.get(state).pipe(
            Effect.andThen(initial => Stream.runFoldEffect(
                View.changes(state),
                () => initial,
                (_, result) => Effect.as(Lens.set(this.state, result), result),
            ) as Effect.Effect<AsyncResult.Success<A, E> | AsyncResult.Failure<A, E>>),
            Effect.tap(result => Lens.set(this.latestFinalResult, Option.some(result))),
        )
    }
}


export declare namespace make {
    export interface Options<K = never, A = void, E = never, R = never> {
        readonly f: (key: K) => Effect.Effect<A, E, R>
    }
}

export const make = Effect.fnUntraced(function* <K = never, A = void, E = never, R = never>(
    options: make.Options<K, A, E, R>
): Effect.fn.Return<
    Mutation<K, A, E, R>,
    never,
    Scope.Scope | R
> {
    return new MutationImpl(
        yield* Effect.context<Scope.Scope | R>(),
        options.f,

        Lens.fromSubscriptionRef(yield* SubscriptionRef.make(Option.none<K>())),
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make(Option.none<Fiber.Fiber<A, E>>())),
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make<AsyncResult.AsyncResult<A, E>>(AsyncResult.initial())),
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make(Option.none<AsyncResult.Success<A, E> | AsyncResult.Failure<A, E>>())),
    )
})
