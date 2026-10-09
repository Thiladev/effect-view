import { type Cause, type Context, Duration, Effect, Equal, type Equivalence, Function, Option, Pipeable, Predicate, type Schedule, type Scope, Semaphore, Stream, SubscriptionRef } from "effect"
import { AsyncResult } from "effect/reactivity"
import * as Lens from "./Lens.js"
import * as Operation from "./Operation.js"
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

    readonly operation: View.View<Option.Option<Operation.Operation<K, A, E, QueryClient.QueryClient | R>>>
    readonly state: View.View<QueryState<K, A, E>>
    readonly latestFinalState: View.View<Option.Option<QueryFinalState<K, A, E>>>

    readonly run: Effect.Effect<void>
    fetch(key: K): Effect.Effect<QueryFinalState<K, A, E>, Cause.NoSuchElementError>
    fetchStream(key: K): Effect.Effect<Stream.Stream<QueryState<K, A, E>>, Cause.NoSuchElementError>
    readonly refresh: Effect.Effect<QueryFinalState<K, A, E>, Cause.NoSuchElementError>
    readonly refreshStream: Effect.Effect<Stream.Stream<QueryState<K, A, E>>, Cause.NoSuchElementError>

    readonly invalidateCache: Effect.Effect<void>
    invalidateCacheEntry(key: K): Effect.Effect<void>
}

export interface QueryState<out K, out A, out E = never> {
    readonly key: K
    readonly result: AsyncResult.AsyncResult<A, E>
}

export interface QueryFinalState<out K, out A, out E = never> {
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

        readonly operation: Lens.Lens<Option.Option<Operation.Operation<K, A, E, QueryClient.QueryClient | R>>>,
        readonly state: Lens.Lens<QueryState<K, A, E>>,
        readonly latestFinalState: Lens.Lens<Option.Option<QueryFinalState<K, A, E>>>,

        readonly runSemaphore: Semaphore.Semaphore,
        readonly startSemaphore: Semaphore.Semaphore,
    ) {
        super()
    }

    get run(): Effect.Effect<void> {
        return Effect.all([
            Stream.runForEach(
                this.key.changes,
                key => this.start(this.previousFor(key)),
            ),

            Effect.promise(() => import("@effect/platform-browser")).pipe(
                Effect.flatMap(({ BrowserStream }) => this.refreshOnWindowFocus
                    ? Stream.runForEach(
                        BrowserStream.fromEventListenerWindow("focus"),
                        () => this.refreshStream,
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
        return Effect.flatMap(Lens.get(this.operation), Option.match({
            onSome: operation => operation.interrupt,
            onNone: () => Effect.void,
        }))
    }

    fetch(key: K): Effect.Effect<QueryFinalState<K, A, E>, Cause.NoSuchElementError> {
        return this.start(Effect.succeed({
            key,
            result: AsyncResult.initial(false),
        })).pipe(
            Effect.flatMap(operation => operation.await),
            Effect.provide(this.context),
        )
    }

    fetchStream(key: K): Effect.Effect<
        Stream.Stream<QueryState<K, A, E>>,
        Cause.NoSuchElementError
    > {
        return this.start(Effect.succeed({
            key,
            result: AsyncResult.initial(false),
        })).pipe(
            Effect.map(operation => operation.stream),
            Effect.provide(this.context),
        )
    }

    get refresh(): Effect.Effect<QueryFinalState<K, A, E>, Cause.NoSuchElementError> {
        return this.start(this.previousForLatestKey).pipe(
            Effect.flatMap(operation => operation.await),
            Effect.provide(this.context),
        )
    }

    get refreshStream(): Effect.Effect<
        Stream.Stream<QueryState<K, A, E>>,
        Cause.NoSuchElementError
    > {
        return this.start(this.previousForLatestKey).pipe(
            Effect.map(operation => operation.stream),
            Effect.provide(this.context),
        )
    }

    previousFor(key: K): Effect.Effect<QueryState<K, A, E>> {
        return Effect.map(Lens.get(this.latestFinalState), latestFinalState =>
            Option.isSome(latestFinalState) && this.keyEquivalence(key, latestFinalState.value.key)
                ? latestFinalState.value
                : {
                    key,
                    result: AsyncResult.initial(false),
                }
        )
    }

    get previousForLatestKey(): Effect.Effect<QueryState<K, A, E>> {
        return Effect.flatMap(Lens.get(this.state), state => this.previousFor(state.key))
    }

    /**
     * Interrupts the current Operation and replaces it with a new one, started from `previous` or served from the
     * cache.
     */
    start(
        previous: Effect.Effect<QueryState<K, A, E>>,
    ): Effect.Effect<
        Operation.Operation<K, A, E, QueryClient.QueryClient | R>,
        Cause.NoSuchElementError,
        Scope.Scope | QueryClient.QueryClient | R
    > {
        return Effect.gen({ self: this }, function*() {
            yield* this.interrupt

            const { key, result } = yield* previous
            const entry = yield* this.getCacheEntry(key)
            const isFresh = Option.isSome(entry) && !(yield* QueryClient.isQueryClientCacheEntryStale(entry.value))

            const effect = Effect.tap(this.f(key), v => this.setCacheEntry(key, AsyncResult.success(v)))

            if (Option.isSome(entry) && isFresh) {
                const state: QueryFinalState<K, A, E> = {
                    key,
                    result: entry.value.result as AsyncResult.Success<A, E>,
                }
                const operation = yield* Operation.makeSettled({ key, effect, state })
                yield* Lens.set(this.operation, Option.some(operation))
                yield* this.listener.onChange(operation, state)
                yield* this.listener.onSettle(operation, state)
                return operation
            }
            else {
                const operation = yield* Operation.make({
                    key,
                    effect,
                    previous: Option.isSome(entry) ? entry.value.result as AsyncResult.AsyncResult<A, E> : result,
                    listener: this.listener,
                })
                yield* Lens.set(this.operation, Option.some(operation))
                yield* operation.start
                return operation
            }
        }).pipe(
            this.startSemaphore.withPermits(1),
        )
    }

    /** Runs `effect` only if `operation` is the current Operation. */
    ifCurrent(
        operation: Operation.Operation<K, A, E, QueryClient.QueryClient | R>,
        effect: Effect.Effect<void>,
    ): Effect.Effect<void> {
        return Effect.flatMap(
            Lens.get(this.operation),
            current => Option.isSome(current) && current.value === operation
                ? effect
                : Effect.void,
        )
    }

    /** Records the state of the current Operation. Superseded Operations are ignored. */
    get listener(): Operation.OperationListener<K, A, E, QueryClient.QueryClient | R> {
        return {
            onChange: (operation, state) => this.ifCurrent(operation, Lens.set(this.state, state)),
            onSettle: (operation, state) => this.ifCurrent(operation, Lens.set(this.latestFinalState, Option.some(state))),
            onInterrupt: () => Effect.void,
        }
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

        Lens.fromSubscriptionRef(yield* SubscriptionRef.make(Option.none<Operation.Operation<K, A, E, QueryClient.QueryClient | R>>())),
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make<QueryState<K, A, E>>({
            key: yield* View.get(options.key),
            result: AsyncResult.initial(false),
        })),
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make(Option.none<QueryFinalState<K, A, E>>())),

        yield* Semaphore.make(1),
        yield* Semaphore.make(1),
    )
})

export const thenRun = <K, A, E = never, R = never, E2 = never, R2 = never>(
    self: Effect.Effect<Query<K, A, E, R>, E2, R2>,
): Effect.Effect<Query<K, A, E, R>, E2, Scope.Scope | R2> => Effect.tap(
    self,
    query => Effect.forkScoped(query.run),
)

/**
 * Refreshes the Query on a schedule and returns it.
 *
 * @example Refresh every five minutes, starting after five minutes
 * ```ts
 * yield* Query.make(options).pipe(
 *   Query.thenRun,
 *   Query.withScheduledRefresh(Schedule.spaced("5 minutes")),
 * )
 * ```
 *
 * @example Refresh at most three times
 * ```ts
 * yield* Query.make(options).pipe(
 *   Query.thenRun,
 *   Query.withScheduledRefresh(
 *     Schedule.spaced("5 minutes").pipe(Schedule.upTo({ times: 3 })),
 *   ),
 * )
 * ```
 */
export const withScheduledRefresh: {
    <Output, Error, Env>(
        schedule: Schedule.Schedule<Output, unknown, Error, Env>,
    ): <K, A, E, R, E2, R2>(
        self: Effect.Effect<Query<K, A, E, R>, E2, R2>,
    ) => Effect.Effect<Query<K, A, E, R>, E2, Scope.Scope | Env | R2>
    <K, A, E, R, E2, R2, Output, Error, Env>(
        self: Effect.Effect<Query<K, A, E, R>, E2, R2>,
        schedule: Schedule.Schedule<Output, unknown, Error, Env>,
    ): Effect.Effect<Query<K, A, E, R>, E2, Scope.Scope | Env | R2>
} = Function.dual(2, <K, A, E, R, E2, R2, Output, Error, Env>(
    self: Effect.Effect<Query<K, A, E, R>, E2, R2>,
    schedule: Schedule.Schedule<Output, unknown, Error, Env>,
) => Effect.tap(
    self,
    query => Effect.forkScoped(Effect.schedule(query.refresh, schedule)),
))
