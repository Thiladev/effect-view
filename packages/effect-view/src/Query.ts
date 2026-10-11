import { type Cause, Context, Duration, Effect, Equal, type Equivalence, Function, Option, Pipeable, Predicate, type Schedule, type Scope, Semaphore, Stream, SubscriptionRef } from "effect"
import { AsyncResult } from "effect/reactivity"
import * as AppConnectivity from "./AppConnectivity.js"
import * as AppFocus from "./AppFocus.js"
import * as Lens from "./Lens.js"
import * as Operation from "./Operation.js"
import * as QueryClient from "./QueryClient.js"
import * as View from "./View.js"


export const QueryTypeId: unique symbol = Symbol.for("@effect-view/Query/Query")
export type QueryTypeId = typeof QueryTypeId

export interface Query<in out K, out A, out E = never, in out R = never>
extends Pipeable.Pipeable {
    readonly [QueryTypeId]: QueryTypeId

    readonly context: Context.Context<Query.Context<R>>
    readonly key: View.View<K>
    readonly keyEquivalence: Equivalence.Equivalence<K>
    readonly f: (key: K) => Effect.Effect<A, E, R>

    readonly staleTime: Duration.Duration
    readonly networkMode: Operation.NetworkMode
    readonly refreshOnFocus: RefreshOn
    readonly refreshOnReconnect: RefreshOn

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

export namespace Query {
    export type Context<R> = Scope.Scope | QueryClient.QueryClient | QueryClient.QueryClientService.Context | R
}

export interface QueryState<out K, out A, out E = never> {
    readonly key: K
    readonly result: AsyncResult.AsyncResult<A, E>
    /** Whether the request is waiting for a network connection before fetching. See `networkMode`. */
    readonly paused: boolean
}

export interface QueryFinalState<out K, out A, out E = never> {
    readonly key: K
    readonly result: AsyncResult.Success<A, E> | AsyncResult.Failure<A, E>
    readonly paused: false
}

/**
 * When a Query refreshes its current key on an event, such as the app regaining focus or connection:
 * - `true`: if the cached result is stale.
 * - `"always"`: regardless of `staleTime`.
 * - `false`: never.
 */
export type RefreshOn = boolean | "always"

export const isQuery = (u: unknown): u is Query<unknown, unknown, unknown, unknown> => Predicate.hasProperty(u, QueryTypeId)


export class QueryImpl<in out K, in out A, in out E = never, in out R = never>
extends Pipeable.Class implements Query<K, A, E, R> {
    readonly [QueryTypeId]: QueryTypeId = QueryTypeId

    constructor(
        readonly context: Context.Context<Query.Context<R>>,
        readonly key: View.View<K>,
        readonly keyEquivalence: Equivalence.Equivalence<K>,
        readonly f: (key: K) => Effect.Effect<A, E, R>,

        readonly staleTime: Duration.Duration,
        readonly networkMode: Operation.NetworkMode,
        readonly refreshOnFocus: RefreshOn,
        readonly refreshOnReconnect: RefreshOn,

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

            this.refreshOnFocus
                ? Effect.flatMap(AppFocus.AppFocus, ({ focused }) => Stream.runForEach(
                    becomesTrue(focused),
                    () => this.refreshUnlessWaiting(this.refreshOnFocus === "always"),
                ))
                : Effect.void,

            this.refreshOnReconnect
                ? Effect.flatMap(AppConnectivity.AppConnectivity, ({ online }) => Stream.runForEach(
                    becomesTrue(online),
                    () => this.refreshUnlessWaiting(this.refreshOnReconnect === "always"),
                ))
                : Effect.void,
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
            paused: false,
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
            paused: false,
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

    /**
     * Refreshes the current key, unless a request is already in flight. Used when the app regains focus or connection:
     * a request that is running keeps running, and one paused for lack of a connection resumes by itself. With
     * `ignoreStaleTime`, a fresh cached result is refreshed too.
     */
    refreshUnlessWaiting(ignoreStaleTime: boolean): Effect.Effect<void, Cause.NoSuchElementError, Query.Context<R>> {
        return Effect.flatMap(
            Lens.get(this.state),
            state => state.result.waiting
                ? Effect.void
                : Effect.asVoid(this.start(this.previousForLatestKey, ignoreStaleTime)),
        )
    }

    previousFor(key: K): Effect.Effect<QueryState<K, A, E>> {
        return Effect.map(Lens.get(this.latestFinalState), latestFinalState =>
            Option.isSome(latestFinalState) && this.keyEquivalence(key, latestFinalState.value.key)
                ? latestFinalState.value
                : {
                    key,
                    result: AsyncResult.initial(false),
                    paused: false,
                }
        )
    }

    get previousForLatestKey(): Effect.Effect<QueryState<K, A, E>> {
        return Effect.flatMap(Lens.get(this.state), state => this.previousFor(state.key))
    }

    /**
     * Interrupts the current Operation and replaces it with a new one, started from `previous` or served from the
     * cache unless `ignoreStaleTime` is true.
     */
    start(
        previous: Effect.Effect<QueryState<K, A, E>>,
        ignoreStaleTime = false,
    ): Effect.Effect<
        Operation.Operation<K, A, E, QueryClient.QueryClient | R>,
        Cause.NoSuchElementError,
        Query.Context<R>
    > {
        return Effect.gen({ self: this }, function*() {
            yield* this.interrupt

            const { key, result } = yield* previous
            const entry = yield* this.getCacheEntry(key)
            const isFresh = !ignoreStaleTime
                && Option.isSome(entry)
                && !(yield* QueryClient.isQueryClientCacheEntryStale(entry.value))

            const effect = Effect.tap(this.f(key), v => this.setCacheEntry(key, AsyncResult.success(v)))

            if (Option.isSome(entry) && isFresh) {
                const state: QueryFinalState<K, A, E> = {
                    key,
                    result: entry.value.result as AsyncResult.Success<A, E>,
                    paused: false,
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
                    networkMode: this.networkMode,
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
        readonly networkMode?: Operation.NetworkMode
        readonly refreshOnFocus?: RefreshOn
        /** Defaults to the client's `defaultRefreshOnReconnect`, and to `false` in `"always"` network mode. */
        readonly refreshOnReconnect?: RefreshOn
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
    const networkMode = options.networkMode ?? client.defaultNetworkMode

    return new QueryImpl(
        Context.mergeAll(
            client.context,
            yield* Effect.context<Scope.Scope | QueryClient.QueryClient | R>(),
        ),
        options.key,
        options.keyEquivalence ?? Equal.asEquivalence(),
        options.f,

        options.staleTime ? yield* Effect.fromOption(Duration.fromInput(options.staleTime)) : client.defaultStaleTime,
        networkMode,
        options.refreshOnFocus ?? client.defaultRefreshOnFocus,
        options.refreshOnReconnect ?? (networkMode === "always" ? false : client.defaultRefreshOnReconnect),

        Lens.fromSubscriptionRef(yield* SubscriptionRef.make(Option.none<Operation.Operation<K, A, E, QueryClient.QueryClient | R>>())),
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make<QueryState<K, A, E>>({
            key: yield* View.get(options.key),
            result: AsyncResult.initial(false),
            paused: false,
        })),
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make(Option.none<QueryFinalState<K, A, E>>())),

        yield* Semaphore.make(1),
        yield* Semaphore.make(1),
    )
})

/** Emits each time `view` becomes true, after its current value. */
const becomesTrue = (view: View.View<boolean>): Stream.Stream<true> => View.changes(view).pipe(
    Stream.changes,
    Stream.drop(1),
    Stream.filter((value): value is true => value),
)

export const thenRun = <K, A, E = never, R = never, E2 = never, R2 = never>(
    self: Effect.Effect<Query<K, A, E, R>, E2, R2>,
): Effect.Effect<Query<K, A, E, R>, E2, Scope.Scope | R2> => Effect.tap(
    self,
    query => Effect.forkScoped(query.run),
)

export declare namespace withScheduledRefresh {
    export interface Options {
        /**
         * Whether to keep refreshing while the app is not focused (see `AppFocus`). Defaults to `false`: a refresh due
         * while the app is not focused is skipped, but still counts as a recurrence of the schedule.
         */
        readonly refreshInBackground?: boolean
    }
}

/**
 * Refreshes the Query on a schedule and returns it. By default, refreshes are skipped while the app is not focused.
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
 *
 * @example Keep refreshing while the app is in the background
 * ```ts
 * yield* Query.make(options).pipe(
 *   Query.thenRun,
 *   Query.withScheduledRefresh(Schedule.spaced("5 minutes"), { refreshInBackground: true }),
 * )
 * ```
 */
export const withScheduledRefresh: {
    <Output, Error, Env>(
        schedule: Schedule.Schedule<Output, unknown, Error, Env>,
        options?: withScheduledRefresh.Options,
    ): <K, A, E, R, E2, R2>(
        self: Effect.Effect<Query<K, A, E, R>, E2, R2>,
    ) => Effect.Effect<Query<K, A, E, R>, E2, Scope.Scope | Env | R2>
    <K, A, E, R, E2, R2, Output, Error, Env>(
        self: Effect.Effect<Query<K, A, E, R>, E2, R2>,
        schedule: Schedule.Schedule<Output, unknown, Error, Env>,
        options?: withScheduledRefresh.Options,
    ): Effect.Effect<Query<K, A, E, R>, E2, Scope.Scope | Env | R2>
} = Function.dual(args => Effect.isEffect(args[0]), <K, A, E, R, E2, R2, Output, Error, Env>(
    self: Effect.Effect<Query<K, A, E, R>, E2, R2>,
    schedule: Schedule.Schedule<Output, unknown, Error, Env>,
    options?: withScheduledRefresh.Options,
) => Effect.tap(
    self,
    query => Effect.forkScoped(Effect.schedule(
        options?.refreshInBackground
            ? query.refresh
            : Effect.flatMap(
                Effect.provide(
                    Effect.flatMap(AppFocus.AppFocus, ({ focused }) => View.get(focused)),
                    query.context,
                ),
                focused => focused
                    ? Effect.asVoid(query.refresh)
                    : Effect.void,
            ),
        schedule,
    )),
))
