import { Cause, type Context, Duration, Effect, Equal, type Equivalence, Exit, Fiber, Function, Option, Pipeable, Predicate, PubSub, Ref, type Schedule, type Scope, Semaphore, Stream, SubscriptionRef } from "effect"
import { AsyncResult } from "effect/unstable/reactivity"
import * as Lens from "./Lens.js"
import * as QueryClient from "./QueryClient.js"
import * as View from "./View.js"


export const QueryTypeId: unique symbol = Symbol.for("@effect-view/Query/Query")
export type QueryTypeId = typeof QueryTypeId

export interface Query<in out K, out A, out E = never, in out R = never>
extends Pipeable.Pipeable {
    readonly [QueryTypeId]: QueryTypeId

    readonly context: Context.Context<Scope.Scope | QueryClient.QueryClient | R>
    readonly key: View.View<K>
    readonly keyEquivalence: Equivalence.Equivalence<K>
    readonly f: (key: K) => Effect.Effect<A, E, R>

    readonly staleTime: Duration.Duration
    readonly refreshOnWindowFocus: boolean

    readonly fiber: View.View<Option.Option<Fiber.Fiber<A, E>>>
    readonly state: View.View<QueryState<K, A, E>>
    readonly latestFinalState: View.View<Option.Option<FinalQueryState<K, A, E>>>

    readonly run: Effect.Effect<void>
    fetch(key: K): Effect.Effect<FinalQueryState<K, A, E>, Cause.NoSuchElementError>
    fetchView(key: K): Effect.Effect<View.View<QueryState<K, A, E>>, Cause.NoSuchElementError>
    readonly refresh: Effect.Effect<FinalQueryState<K, A, E>, Cause.NoSuchElementError>
    readonly refreshView: Effect.Effect<View.View<QueryState<K, A, E>>, Cause.NoSuchElementError>

    readonly invalidateCache: Effect.Effect<void>
    invalidateCacheEntry(key: K): Effect.Effect<void>
}

export interface QueryState<out K, out A, out E = never> {
    readonly key: K
    readonly result: AsyncResult.AsyncResult<A, E>
}

export interface FinalQueryState<out K, out A, out E = never> {
    readonly key: K
    readonly result: AsyncResult.Success<A, E> | AsyncResult.Failure<A, E>
}

export const isQuery = (u: unknown): u is Query<unknown, unknown, unknown, unknown> => Predicate.hasProperty(u, QueryTypeId)


export class QueryImpl<in out K, in out A, in out E = never, in out R = never>
extends Pipeable.Class implements Query<K, A, E, R> {
    readonly [QueryTypeId]: QueryTypeId = QueryTypeId

    constructor(
        readonly context: Context.Context<Scope.Scope | QueryClient.QueryClient | R>,
        readonly key: View.View<K>,
        readonly keyEquivalence: Equivalence.Equivalence<K>,
        readonly f: (key: K) => Effect.Effect<A, E, R>,

        readonly staleTime: Duration.Duration,
        readonly refreshOnWindowFocus: boolean,

        readonly fiber: Lens.Lens<Option.Option<Fiber.Fiber<A, E>>>,
        readonly state: Lens.Lens<QueryState<K, A, E>>,
        readonly latestFinalState: Lens.Lens<Option.Option<FinalQueryState<K, A, E>>>,

        readonly runSemaphore: Semaphore.Semaphore,
    ) {
        super()
    }

    get run(): Effect.Effect<void> {
        return Effect.all([
            Stream.runForEach(
                this.key.changes,
                key => Effect.gen({ self: this }, function*() {
                    yield* this.interrupt
                    const latestFinalState = yield* Lens.get(this.latestFinalState)

                    const state = yield* this.startCached(
                        Option.isSome(latestFinalState) && this.keyEquivalence(key, latestFinalState.value.key)
                            ? latestFinalState.value
                            : {
                                key,
                                result: AsyncResult.initial(false),
                            }
                    )

                    yield* Effect.forkScoped(this.watch(state))
                }),
            ),

            Effect.promise(() => import("@effect/platform-browser")).pipe(
                Effect.flatMap(({ BrowserStream }) => this.refreshOnWindowFocus
                    ? Stream.runForEach(
                        BrowserStream.fromEventListenerWindow("focus"),
                        () => this.refreshView,
                    )
                    : Effect.void
                ),
                Effect.catchDefect(() => Effect.void),
            ),
        ], { concurrency: "unbounded" }).pipe(
            Effect.ignore,
            this.runSemaphore.withPermits(1),
            Effect.provide(this.context),
        )
    }

    get interrupt(): Effect.Effect<void> {
        return Effect.flatMap(Lens.get(this.fiber), Option.match({
            onSome: Fiber.interrupt,
            onNone: () => Effect.void,
        }))
    }

    fetch(key: K): Effect.Effect<FinalQueryState<K, A, E>, Cause.NoSuchElementError> {
        return Effect.gen({ self: this }, function*() {
            yield* this.interrupt
            const state = yield* this.startCached({
                key,
                result: AsyncResult.initial(false),
            })
            return yield* this.watch(state)
        }).pipe(
            Effect.provide(this.context),
        )
    }

    fetchView(key: K): Effect.Effect<
        View.View<QueryState<K, A, E>>,
        Cause.NoSuchElementError
    > {
        return Effect.gen({ self: this }, function*() {
            yield* this.interrupt
            const state = yield* this.startCached({
                key,
                result: AsyncResult.initial(false),
            })

            yield* Effect.forkScoped(this.watch(state))
            return state
        }).pipe(
            Effect.provide(this.context),
        )
    }

    get refresh(): Effect.Effect<FinalQueryState<K, A, E>, Cause.NoSuchElementError> {
        return Effect.gen({ self: this }, function*() {
            yield* this.interrupt
            const latestState = yield* Lens.get(this.state)
            const latestFinalState = yield* Lens.get(this.latestFinalState)

            const state = yield* this.startCached(
                Option.isSome(latestFinalState) && this.keyEquivalence(latestState.key, latestFinalState.value.key)
                    ? latestFinalState.value
                    : {
                        key: latestState.key,
                        result: AsyncResult.initial(false),
                    }
            )

            return yield* this.watch(state)
        }).pipe(
            Effect.provide(this.context),
        )
    }

    get refreshView(): Effect.Effect<
        View.View<QueryState<K, A, E>>,
        Cause.NoSuchElementError
    > {
        return Effect.gen({ self: this }, function*() {
            yield* this.interrupt
            const latestState = yield* Lens.get(this.state)
            const latestFinalState = yield* Lens.get(this.latestFinalState)

            const state = yield* this.startCached(
                Option.isSome(latestFinalState) && this.keyEquivalence(latestState.key, latestFinalState.value.key)
                    ? latestFinalState.value
                    : {
                        key: latestState.key,
                        result: AsyncResult.initial(false),
                    }
            )

            yield* Effect.forkScoped(this.watch(state))
            return state
        }).pipe(
            Effect.provide(this.context),
        )
    }

    startCached(
        previous: QueryState<K, A, E>,
    ): Effect.Effect<
        View.View<QueryState<K, A, E>>,
        Cause.NoSuchElementError,
        Scope.Scope | QueryClient.QueryClient | R
    > {
        return Effect.flatMap(this.getCacheEntry(previous.key), Option.match({
            onSome: entry => Effect.flatMap(
                QueryClient.isQueryClientCacheEntryStale(entry),
                isStale => isStale
                    ? this.start({
                        key: previous.key,
                        result: entry.result as AsyncResult.AsyncResult<A, E>,
                    })
                    : Effect.succeed(View.make({
                        get: Effect.succeed({
                            key: previous.key,
                            result: entry.result as AsyncResult.AsyncResult<A, E>,
                        }),
                        get changes() {
                            return Stream.make({
                                key: previous.key,
                                result: entry.result as AsyncResult.AsyncResult<A, E>,
                            })
                        },
                    })),
            ),
            onNone: () => this.start(previous),
        }))
    }

    start(
        previous: QueryState<K, A, E>,
    ): Effect.Effect<
        View.View<QueryState<K, A, E>>,
        never,
        Scope.Scope | R
    > {
        return Effect.gen({ self: this }, function*() {
            const state = yield* makeQueryStateLens(previous)

            const fiber = yield* Effect.forkScoped(Effect.andThen(
                Lens.update<QueryState<K, A, E>, never, never, never, never>(
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

                Effect.onExit(this.f(previous.key), exit => Effect.gen({ self: this }, function*() {
                    const fiberId = yield* Effect.fiberId
                    const fiber = yield* Lens.get(this.fiber)

                    if (Option.isSome(fiber) && fiberId === fiber.value.id)
                        yield* Lens.set(this.fiber, Option.none())

                    const finalState = (yield* Lens.updateAndGet<QueryState<K, A, E>, never, never, never, never>(
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
                    )) as FinalQueryState<K, A, E>

                    yield* Lens.set(this.latestFinalState, Option.some(finalState))
                    yield* PubSub.shutdown(state.pubsub)
                }))
            ))

            yield* Lens.set(this.fiber, Option.some(fiber))
            return state
        })
    }

    watch(
        view: View.View<QueryState<K, A, E>>
    ): Effect.Effect<FinalQueryState<K, A, E>, never, QueryClient.QueryClient> {
        return Effect.gen({ self: this }, function*() {
            const initial = yield* View.get(view)
            const final = yield* Stream.runFoldEffect(
                View.changes(view),
                () => initial,
                (_, state) => Effect.as(Lens.set(this.state, state), state),
            ) as Effect.Effect<FinalQueryState<K, A, E>>

            yield* Lens.set(this.latestFinalState, Option.some(final))
            if (AsyncResult.isSuccess(final.result))
                yield* this.setCacheEntry(final.key, final.result)

            return final
        })
    }

    makeCacheKey(key: K): QueryClient.QueryClientCacheKey {
        return new QueryClient.QueryClientCacheKey(key, this.f as (key: unknown) => Effect.Effect<unknown, unknown, unknown>)
    }

    getCacheEntry(
        key: K
    ): Effect.Effect<Option.Option<QueryClient.QueryClientCacheEntry>, never, QueryClient.QueryClient> {
        return Effect.andThen(
            Effect.all([
                Effect.succeed(this.makeCacheKey(key)),
                QueryClient.QueryClient,
            ]),
            ([key, client]) => client.getCacheEntry(key),
        )
    }

    setCacheEntry(
        key: K,
        result: AsyncResult.Success<A, E>,
    ): Effect.Effect<QueryClient.QueryClientCacheEntry, never, QueryClient.QueryClient> {
        return Effect.flatMap(
            Effect.all([
                Effect.succeed(this.makeCacheKey(key)),
                QueryClient.QueryClient,
            ]),
            ([key, client]) => client.setCacheEntry(key, result, this.staleTime),
        )
    }

    get invalidateCache(): Effect.Effect<void> {
        return QueryClient.QueryClient.pipe(
            Effect.andThen(client => client.invalidateCacheEntries(this.f as (key: unknown) => Effect.Effect<unknown, unknown, unknown>)),
            Effect.provide(this.context),
        )
    }

    invalidateCacheEntry(key: K): Effect.Effect<void> {
        return Effect.all([
            Effect.succeed(this.makeCacheKey(key)),
            QueryClient.QueryClient,
        ]).pipe(
            Effect.andThen(([key, client]) => client.invalidateCacheEntry(key)),
            Effect.provide(this.context),
        )
    }
}

export declare namespace make {
    export interface Options<K, A, E = never, R = never> {
        readonly key: View.View<K>,
        readonly keyEquivalence?: Equivalence.Equivalence<K>,
        readonly f: (key: K) => Effect.Effect<A, E, R>

        readonly staleTime?: Duration.Input
        readonly refreshOnWindowFocus?: boolean
    }
}

export const make = Effect.fnUntraced(function* <K, A, E = never, R = never>(
    options: make.Options<K, A, E, R>
): Effect.fn.Return<
    Query<K, A, E, R>,
    Cause.NoSuchElementError,
    Scope.Scope | QueryClient.QueryClient | R
> {
    const client = yield* QueryClient.QueryClient

    return new QueryImpl(
        yield* Effect.context<Scope.Scope | QueryClient.QueryClient | R>(),
        options.key,
        options.keyEquivalence ?? Equal.asEquivalence(),
        options.f,

        options.staleTime ? yield* Effect.fromOption(Duration.fromInput(options.staleTime)) : client.defaultStaleTime,
        options.refreshOnWindowFocus ?? client.defaultRefreshOnWindowFocus,

        Lens.fromSubscriptionRef(yield* SubscriptionRef.make(Option.none<Fiber.Fiber<A, E>>())),
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make<QueryState<K, A, E>>({
            key: yield* View.get(options.key),
            result: AsyncResult.initial(false),
        })),
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make(Option.none<FinalQueryState<K, A, E>>())),

        yield* Semaphore.make(1),
    )
})

export const service = <K, A, E = never, R = never>(
    options: make.Options<K, A, E, R>
): Effect.Effect<
    Query<K, A, E, R>,
    Cause.NoSuchElementError,
    Scope.Scope | QueryClient.QueryClient | R
> => Effect.tap(
    make(options),
    query => Effect.forkScoped(query.run),
)

/**
 * Refreshes the Query on a schedule and returns it.
 *
 * @example Refresh every five minutes, starting after five minutes
 * ```ts
 * yield* query.pipe(
 *   Query.withScheduledRefresh(Schedule.spaced("5 minutes")),
 * )
 * ```
 *
 * @example Refresh at most three times
 * ```ts
 * yield* query.pipe(
 *   Query.withScheduledRefresh(
 *     Schedule.spaced("5 minutes").pipe(Schedule.upTo({ times: 3 })),
 *   ),
 * )
 * ```
 */
export const withScheduledRefresh: {
    <Output, Error, Env>(
        schedule: Schedule.Schedule<Output, unknown, Error, Env>,
    ): <K, A, E, R>(
        self: Query<K, A, E, R>,
    ) => Effect.Effect<Query<K, A, E, R>, never, Scope.Scope | Env>
    <K, A, E, R, Output, Error, Env>(
        self: Query<K, A, E, R>,
        schedule: Schedule.Schedule<Output, unknown, Error, Env>,
    ): Effect.Effect<Query<K, A, E, R>, never, Scope.Scope | Env>
} = Function.dual(2, <K, A, E, R, Output, Error, Env>(
    self: Query<K, A, E, R>,
    schedule: Schedule.Schedule<Output, unknown, Error, Env>,
) => Effect.schedule(self.refresh, schedule).pipe(
    Effect.forkScoped,
    Effect.as(self),
))


export class QueryStateLens<in out K, in out A, in out E = never>
extends Lens.LensImpl<QueryState<K, A, E>, never, never, never, never> {
    constructor(
        readonly ref: Ref.Ref<QueryState<K, A, E>>,
        readonly pubsub: PubSub.PubSub<QueryState<K, A, E>>,
        readonly semaphore: Semaphore.Semaphore,
    ) {
        super()
    }

    get resolve(): Effect.Effect<Lens.LensImpl.Resolved<QueryState<K, A, E>>, never, never> {
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

export const makeQueryStateLens = <K, A, E = never>(
    initial: QueryState<K, A, E>,
) => Effect.all([
    Ref.make(initial),
    PubSub.unbounded<QueryState<K, A, E>>({ replay: 1 }),
    Semaphore.make(1),
]).pipe(
    Effect.tap(([, pubsub]) => PubSub.publish(pubsub, initial)),
    Effect.map(([ref, pubsub, semaphore]) => new QueryStateLens(ref, pubsub, semaphore)),
)
