import { Cause, type Context, Effect, Exit, type Fiber, Option, Pipeable, Predicate, PubSub, Ref, type Scope, Semaphore, Stream, SubscriptionRef } from "effect"
import { AsyncResult } from "effect/unstable/reactivity"
import * as Lens from "./Lens.js"
import * as View from "./View.js"


export const MutationTypeId: unique symbol = Symbol.for("@effect-view/Mutation/Mutation")
export type MutationTypeId = typeof MutationTypeId

export interface Mutation<in out K, out A, out E = never, in out R = never>
extends Pipeable.Pipeable {
    readonly [MutationTypeId]: MutationTypeId

    readonly context: Context.Context<Scope.Scope | R>
    readonly f: (key: K) => Effect.Effect<A, E, R>

    readonly latestKey: View.View<Option.Option<K>>
    readonly fiber: View.View<Option.Option<Fiber.Fiber<A, E>>>
    readonly state: View.View<LatestMutationState<K, A, E>>
    readonly latestFinalState: View.View<Option.Option<FinalMutationState<K, A, E>>>

    mutate(key: K): Effect.Effect<FinalMutationState<K, A, E>>
    mutateView(key: K): Effect.Effect<View.View<MutationState<K, A, E>>>
}

export interface LatestMutationState<out K, out A, out E = never> {
    readonly key: Option.Option<K>
    readonly result: AsyncResult.AsyncResult<A, E>
}

export interface MutationState<out K, out A, out E = never> {
    readonly key: Option.Some<K>
    readonly result: AsyncResult.AsyncResult<A, E>
}

export interface FinalMutationState<out K, out A, out E = never> {
    readonly key: Option.Some<K>
    readonly result: AsyncResult.Success<A, E> | AsyncResult.Failure<A, E>
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
        readonly state: Lens.Lens<LatestMutationState<K, A, E>>,
        readonly latestFinalState: Lens.Lens<Option.Option<FinalMutationState<K, A, E>>>,
    ) {
        super()
    }

    mutate(key: K): Effect.Effect<FinalMutationState<K, A, E>> {
        return Lens.set(this.latestKey, Option.some(key)).pipe(
            Effect.andThen(this.start(key)),
            Effect.flatMap(state => this.watch(state)),
            Effect.provide(this.context),
        )
    }
    mutateView(key: K): Effect.Effect<View.View<MutationState<K, A, E>>> {
        return Lens.set(this.latestKey, Option.some(key)).pipe(
            Effect.andThen(this.start(key)),
            Effect.tap(state => Effect.forkScoped(this.watch(state))),
            Effect.provide(this.context),
        )
    }

    start(key: K): Effect.Effect<
        View.View<MutationState<K, A, E>>,
        never,
        Scope.Scope | R
    > {
        return Effect.gen({ self: this }, function*() {
            const previous: MutationState<K, A, E> = Option.getOrElse(yield* Lens.get(this.latestFinalState), () => ({
                key: Option.some(key) as Option.Some<K>,
                result: AsyncResult.initial(),
            }))
            const state = yield* makeMutationStateLens(previous)

            const fiber = yield* Effect.forkScoped(Effect.andThen(
                Lens.update<MutationState<K, A, E>, never, never, never, never>(
                    state,
                    previous => AsyncResult.match(previous.result, {
                        onInitial: () => ({
                            key: previous.key,
                            result: AsyncResult.initial(true),
                        }),
                        onSuccess: result => ({
                            key: previous.key,
                            result: AsyncResult.success(result.value, {
                                waiting: true,
                            }),
                        }),
                        onFailure: result => ({
                            key: previous.key,
                            result: AsyncResult.failure(result.cause, {
                                waiting: true,
                                previousSuccess: result.previousSuccess,
                            }),
                        }),
                    }
                )),

                Effect.onExit(this.f(previous.key.value), exit => Effect.gen({ self: this }, function*() {
                    const fiberId = yield* Effect.fiberId
                    const fiber = yield* Lens.get(this.fiber)

                    if (Option.isSome(fiber) && fiberId === fiber.value.id)
                        yield* Lens.set(this.fiber, Option.none())

                    const finalState = (yield* Lens.updateAndGet<MutationState<K, A, E>, never, never, never, never>(
                        state,
                        previous => Exit.match(exit, {
                            onSuccess: v => ({
                                key: previous.key,
                                result: AsyncResult.success(v),
                            }),
                            onFailure: c => Cause.hasInterruptsOnly(c)
                                ? previous
                                : AsyncResult.match(previous.result, {
                                    onInitial: () => ({
                                        key: previous.key,
                                        result: AsyncResult.failure(c),
                                    }),
                                    onSuccess: v => ({
                                        key: previous.key,
                                        result: AsyncResult.failure(c, {
                                            previousSuccess: Option.some(v),
                                        }),
                                    }),
                                    onFailure: v => ({
                                        key: previous.key,
                                        result: AsyncResult.failure(c, {
                                            previousSuccess: v.previousSuccess,
                                        }),
                                    }),
                                }),
                        }),
                    )) as FinalMutationState<K, A, E>

                    yield* Lens.set(this.latestFinalState, Option.some(finalState))
                    yield* PubSub.shutdown(state.pubsub)
                }))
            ))

            yield* Lens.set(this.fiber, Option.some(fiber))
            return state
        })
    }

    watch(
        state: View.View<MutationState<K, A, E>>
    ): Effect.Effect<FinalMutationState<K, A, E>> {
        return View.get(state).pipe(
            Effect.andThen(initial => Stream.runFoldEffect(
                View.changes(state),
                () => initial,
                (_, result) => Effect.as(Lens.set(this.state, result), result),
            ) as Effect.Effect<FinalMutationState<K, A, E>>),
            Effect.tap(result => Lens.set(this.latestFinalState, Option.some(result))),
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
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make<LatestMutationState<K, A, E>>({
            key: Option.none(),
            result: AsyncResult.initial(),
        })),
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make(Option.none<FinalMutationState<K, A, E>>())),
    )
})


export class MutationStateLens<in out K, in out A, in out E = never>
extends Lens.LensImpl<MutationState<K, A, E>, never, never, never, never> {
    constructor(
        readonly ref: Ref.Ref<MutationState<K, A, E>>,
        readonly pubsub: PubSub.PubSub<MutationState<K, A, E>>,
        readonly semaphore: Semaphore.Semaphore,
    ) {
        super()
    }

    get resolve(): Effect.Effect<Lens.LensImpl.Resolved<MutationState<K, A, E>>, never, never> {
        return Effect.map(
            Ref.get(this.ref),
            value => ({
                value,
                commit: next => Effect.flatMap(
                    next,
                    value => Effect.andThen(
                        Ref.set(this.ref, value),
                        PubSub.publish(this.pubsub, value),
                    ),
                ),
            }),
        )
    }
    get changes() { return Stream.fromPubSub(this.pubsub) }
    get lock() { return Effect.succeed(this.semaphore.withPermit) }
}

export const makeMutationStateLens = <K, A, E = never>(
    initial: MutationState<K, A, E>,
) => Effect.all([
    Ref.make(initial),
    PubSub.unbounded<MutationState<K, A, E>>({ replay: 1 }),
    Semaphore.make(1),
]).pipe(
    Effect.tap(([, pubsub]) => PubSub.publish(pubsub, initial)),
    Effect.map(([ref, pubsub, semaphore]) => new MutationStateLens(ref, pubsub, semaphore)),
)
