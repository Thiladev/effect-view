import { type Cause, Context, DateTime, Duration, Effect, Equal, Equivalence, Hash, HashMap, Layer, type Option, Pipeable, Predicate, Schedule, type Scope, Semaphore, SubscriptionRef } from "effect"
import type { AsyncResult } from "effect/reactivity"
import * as AppConnectivity from "./AppConnectivity.js"
import * as AppFocus from "./AppFocus.js"
import * as Lens from "./Lens.js"
import type * as Operation from "./Operation.js"
import type * as Query from "./Query.js"
import type * as View from "./View.js"


export const QueryClientServiceTypeId: unique symbol = Symbol.for("@effect-view/QueryClient/QueryClientService")
export type QueryClientServiceTypeId = typeof QueryClientServiceTypeId

export interface QueryClientService extends Pipeable.Pipeable {
    readonly [QueryClientServiceTypeId]: QueryClientServiceTypeId

    readonly context: Context.Context<QueryClientService.Context>
    readonly cache: View.View<HashMap.HashMap<QueryClientCacheKey, QueryClientCacheEntry>>
    readonly cacheGcTime: Duration.Duration

    readonly defaultStaleTime: Duration.Duration
    readonly defaultNetworkMode: Operation.NetworkMode
    readonly defaultRefreshOnFocus: Query.RefreshOn
    readonly defaultRefreshOnReconnect: Query.RefreshOn
    readonly defaultMutationNetworkMode: Operation.NetworkMode

    readonly run: Effect.Effect<void, Cause.NoSuchElementError>

    getCacheEntry(key: QueryClientCacheKey): Effect.Effect<Option.Option<QueryClientCacheEntry>>
    setCacheEntry(
        key: QueryClientCacheKey,
        result: AsyncResult.Success<unknown, unknown>,
        staleTime: Duration.Duration,
    ): Effect.Effect<QueryClientCacheEntry>
    invalidateCacheEntries(f: (key: unknown) => Effect.Effect<unknown, unknown, unknown>): Effect.Effect<void>
    invalidateCacheEntry(key: QueryClientCacheKey): Effect.Effect<void>
}

export namespace QueryClientService {
    export type Context = AppConnectivity.AppConnectivity | AppFocus.AppFocus
}

export class QueryClientServiceImpl
extends Pipeable.Class
implements QueryClientService {
    readonly [QueryClientServiceTypeId]: QueryClientServiceTypeId = QueryClientServiceTypeId

    constructor(
        readonly context: Context.Context<QueryClientService.Context>,
        readonly cache: Lens.Lens<HashMap.HashMap<QueryClientCacheKey, QueryClientCacheEntry>>,
        readonly cacheGcTime: Duration.Duration,

        readonly defaultStaleTime: Duration.Duration,
        readonly defaultNetworkMode: Operation.NetworkMode,
        readonly defaultRefreshOnFocus: Query.RefreshOn,
        readonly defaultRefreshOnReconnect: Query.RefreshOn,
        readonly defaultMutationNetworkMode: Operation.NetworkMode,

        readonly runSemaphore: Semaphore.Semaphore,
    ) {
        super()
    }

    get run(): Effect.Effect<void, Cause.NoSuchElementError> {
        return this.runSemaphore.withPermits(1)(Effect.repeat(
            Effect.flatMap(
                DateTime.now,
                now => Lens.update(this.cache, HashMap.filter(entry =>
                    Duration.isLessThan(
                        DateTime.distance(entry.lastAccessedAt, now),
                        Duration.sum(entry.staleTime, this.cacheGcTime),
                    )
                )),
            ),
            Schedule.spaced("30 second"),
        ))
    }

    getCacheEntry(key: QueryClientCacheKey): Effect.Effect<Option.Option<QueryClientCacheEntry>> {
        return Effect.all([
            DateTime.now,
            Effect.flatMap(
                Effect.map(Lens.get(this.cache), HashMap.get(key)),
                Effect.fromOption,
            ),
        ]).pipe(
            Effect.map(([now, entry]) => new QueryClientCacheEntry(entry.result, entry.staleTime, entry.createdAt, now)),
            Effect.tap(entry => Lens.update(this.cache, HashMap.set(key, entry))),
            Effect.option,
        )
    }

    setCacheEntry(
        key: QueryClientCacheKey,
        result: AsyncResult.Success<unknown, unknown>,
        staleTime: Duration.Duration,
    ): Effect.Effect<QueryClientCacheEntry> {
        return DateTime.now.pipe(
            Effect.map(now => new QueryClientCacheEntry(result, staleTime, now, now)),
            Effect.tap(entry => Lens.update(this.cache, HashMap.set(key, entry))),
        )
    }

    invalidateCacheEntries(f: (key: unknown) => Effect.Effect<unknown, unknown, unknown>): Effect.Effect<void> {
        return Lens.update(this.cache, HashMap.filter((_, key) => !Equivalence.strictEqual()(key.f, f)))
    }
    invalidateCacheEntry(key: QueryClientCacheKey): Effect.Effect<void> {
        return Lens.update(this.cache, HashMap.remove(key))
    }
}

export const isQueryClientService = (u: unknown): u is QueryClientService => Predicate.hasProperty(u, QueryClientServiceTypeId)

export declare namespace make {
    export interface Options {
        readonly cacheGcTime?: Duration.Input
        readonly defaultStaleTime?: Duration.Input
        /** The default network mode of queries. */
        readonly defaultNetworkMode?: Operation.NetworkMode
        readonly defaultRefreshOnFocus?: Query.RefreshOn
        readonly defaultRefreshOnReconnect?: Query.RefreshOn
        /** The default network mode of mutations. */
        readonly defaultMutationNetworkMode?: Operation.NetworkMode
    }
}

export const make = Effect.fnUntraced(function* (
    options: make.Options = {}
): Effect.fn.Return<
    QueryClientService,
    Cause.NoSuchElementError,
    QueryClientService.Context
> {
    return new QueryClientServiceImpl(
        Context.empty().pipe(
            Context.add(AppConnectivity.AppConnectivity, yield* AppConnectivity.AppConnectivity),
            Context.add(AppFocus.AppFocus, yield* AppFocus.AppFocus),
        ),
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make(HashMap.empty<QueryClientCacheKey, QueryClientCacheEntry>())),
        yield* Effect.fromOption(Duration.fromInput(options.cacheGcTime ?? "5 minutes")),
        yield* Effect.fromOption(Duration.fromInput(options.defaultStaleTime ?? "0 minutes")),

        options.defaultNetworkMode ?? "online",
        options.defaultRefreshOnFocus ?? true,
        options.defaultRefreshOnReconnect ?? true,
        options.defaultMutationNetworkMode ?? "online",

        yield* Semaphore.make(1),
    )
})

export const thenRun = <E = never, R = never>(
    self: Effect.Effect<QueryClientService, E, R>,
): Effect.Effect<QueryClientService, E, Scope.Scope | R> => Effect.tap(
    self,
    client => Effect.forkScoped(client.run),
)


export class QueryClient extends Context.Service<QueryClient, QueryClientService>()(
    "@effect-view/QueryClient/QueryClient"
) {}

export const layer: Layer.Layer<
    QueryClient,
    Cause.NoSuchElementError,
    QueryClientService.Context
> = Layer.effect(QueryClient, thenRun(make()))

export const layerWithOptions = (options: make.Options): Layer.Layer<
    QueryClient,
    Cause.NoSuchElementError,
    QueryClientService.Context
> => Layer.effect(QueryClient, thenRun(make(options)))

export const layerBrowser: Layer.Layer<
    QueryClient,
    Cause.NoSuchElementError,
    never
> = layer.pipe(
    Layer.provide(AppConnectivity.layerBrowser),
    Layer.provide(AppFocus.layerBrowser),
)

export const layerBrowserWithOptions = (options: make.Options): Layer.Layer<
    QueryClient,
    Cause.NoSuchElementError,
    never
> => layerWithOptions(options).pipe(
    Layer.provide(AppConnectivity.layerBrowser),
    Layer.provide(AppFocus.layerBrowser),
)


export const QueryClientCacheKeyTypeId: unique symbol = Symbol.for("@effect-view/QueryClient/QueryClientCacheKey")
export type QueryClientCacheKeyTypeId = typeof QueryClientCacheKeyTypeId

export class QueryClientCacheKey
extends Pipeable.Class
implements Pipeable.Pipeable, Equal.Equal {
    readonly [QueryClientCacheKeyTypeId]: QueryClientCacheKeyTypeId = QueryClientCacheKeyTypeId

    constructor(
        readonly key: unknown,
        readonly f: (key: unknown) => Effect.Effect<unknown, unknown, unknown>,
    ) {
        super()
    }

    [Equal.symbol](that: Equal.Equal) {
        return isQueryClientCacheKey(that) && Equal.equals(this.key, that.key) && Equivalence.strictEqual()(this.f, that.f)
    }
    [Hash.symbol]() {
        return Hash.combine(Hash.hash(this.f))(Hash.hash(this.key))
    }
}

export const isQueryClientCacheKey = (u: unknown): u is QueryClientCacheKey => Predicate.hasProperty(u, QueryClientCacheKeyTypeId)


export const QueryClientCacheEntryTypeId: unique symbol = Symbol.for("@effect-view/QueryClient/QueryClientCacheEntry")
export type QueryClientCacheEntryTypeId = typeof QueryClientCacheEntryTypeId

export class QueryClientCacheEntry
extends Pipeable.Class
implements Pipeable.Pipeable {
    readonly [QueryClientCacheEntryTypeId]: QueryClientCacheEntryTypeId = QueryClientCacheEntryTypeId

    constructor(
        readonly result: AsyncResult.Success<unknown, unknown>,
        readonly staleTime: Duration.Duration,
        readonly createdAt: DateTime.DateTime,
        readonly lastAccessedAt: DateTime.DateTime,
    ) {
        super()
    }
}

export const isQueryClientCacheEntry = (u: unknown): u is QueryClientCacheEntry => Predicate.hasProperty(u, QueryClientCacheEntryTypeId)

export const isQueryClientCacheEntryStale = (
    self: QueryClientCacheEntry
): Effect.Effect<boolean, Cause.NoSuchElementError> => Effect.map(
    DateTime.now,
    now => Duration.isGreaterThanOrEqualTo(DateTime.distance(self.createdAt, now), self.staleTime),
)
