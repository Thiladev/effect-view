import { DateTime, Duration, Effect, Equal, Equivalence, Hash, HashMap, type Option, Pipeable, Predicate, Schedule, type Scope, type Subscribable, SubscriptionRef } from "effect"
import type * as Query from "./Query.js"
import type * as Result from "./Result.js"


export const QueryClientServiceTypeId: unique symbol = Symbol.for("@effect-fc/QueryClient/QueryClientService")
export type QueryClientServiceTypeId = typeof QueryClientServiceTypeId

export interface QueryClientService extends Pipeable.Pipeable {
    readonly [QueryClientServiceTypeId]: QueryClientServiceTypeId

    readonly cache: Subscribable.Subscribable<HashMap.HashMap<QueryClientCacheKey, QueryClientCacheEntry>>
    readonly cacheGcTime: Duration.DurationInput
    readonly defaultStaleTime: Duration.DurationInput
    readonly defaultRefreshOnWindowFocus: boolean

    readonly run: Effect.Effect<void>
    getCacheEntry(key: QueryClientCacheKey): Effect.Effect<Option.Option<QueryClientCacheEntry>>
    setCacheEntry(
        key: QueryClientCacheKey,
        result: Result.Success<unknown>,
        staleTime: Duration.DurationInput,
    ): Effect.Effect<QueryClientCacheEntry>
    invalidateCacheEntries(f: (key: Query.Query.AnyKey) => Effect.Effect<unknown, unknown, unknown>): Effect.Effect<void>
    invalidateCacheEntry(key: QueryClientCacheKey): Effect.Effect<void>
}

export class QueryClient extends Effect.Service<QueryClient>()("@effect-fc/QueryClient/QueryClient", {
    scoped: Effect.suspend(() => service())
}) {}

export class QueryClientServiceImpl
extends Pipeable.Class()
implements QueryClientService {
    readonly [QueryClientServiceTypeId]: QueryClientServiceTypeId = QueryClientServiceTypeId

    constructor(
        readonly cache: SubscriptionRef.SubscriptionRef<HashMap.HashMap<QueryClientCacheKey, QueryClientCacheEntry>>,
        readonly cacheGcTime: Duration.DurationInput,
        readonly defaultStaleTime: Duration.DurationInput,
        readonly defaultRefreshOnWindowFocus: boolean,
        readonly runSemaphore: Effect.Semaphore,
    ) {
        super()
    }

    get run(): Effect.Effect<void> {
        return this.runSemaphore.withPermits(1)(Effect.repeat(
            Effect.andThen(
                DateTime.now,
                now => SubscriptionRef.update(this.cache, HashMap.filter(entry =>
                    Duration.lessThan(
                        DateTime.distanceDuration(entry.lastAccessedAt, now),
                        Duration.sum(entry.staleTime, this.cacheGcTime),
                    )
                )),
            ),
            Schedule.spaced("30 second"),
        ))
    }

    getCacheEntry(key: QueryClientCacheKey): Effect.Effect<Option.Option<QueryClientCacheEntry>> {
        return Effect.all([
            Effect.andThen(this.cache, HashMap.get(key)),
            DateTime.now,
        ]).pipe(
            Effect.map(([entry, now]) => new QueryClientCacheEntry(entry.result, entry.staleTime, entry.createdAt, now)),
            Effect.tap(entry => SubscriptionRef.update(this.cache, HashMap.set(key, entry))),
            Effect.option,
        )
    }

    setCacheEntry(
        key: QueryClientCacheKey,
        result: Result.Success<unknown>,
        staleTime: Duration.DurationInput,
    ): Effect.Effect<QueryClientCacheEntry> {
        return DateTime.now.pipe(
            Effect.map(now => new QueryClientCacheEntry(result, staleTime, now, now)),
            Effect.tap(entry => SubscriptionRef.update(this.cache, HashMap.set(key, entry))),
        )
    }

    invalidateCacheEntries(f: (key: Query.Query.AnyKey) => Effect.Effect<unknown, unknown, unknown>): Effect.Effect<void> {
        return SubscriptionRef.update(this.cache, HashMap.filter((_, key) => !Equivalence.strict()(key.f, f)))
    }
    invalidateCacheEntry(key: QueryClientCacheKey): Effect.Effect<void> {
        return SubscriptionRef.update(this.cache, HashMap.remove(key))
    }
}

export const isQueryClientService = (u: unknown): u is QueryClientService => Predicate.hasProperty(u, QueryClientServiceTypeId)

export declare namespace make {
    export interface Options {
        readonly cacheGcTime?: Duration.DurationInput
        readonly defaultStaleTime?: Duration.DurationInput
        readonly defaultRefreshOnWindowFocus?: boolean
    }
}

export const make = Effect.fnUntraced(function* (options: make.Options = {}): Effect.fn.Return<QueryClientService> {
    return new QueryClientServiceImpl(
        yield* SubscriptionRef.make(HashMap.empty<QueryClientCacheKey, QueryClientCacheEntry>()),
        options.cacheGcTime ?? "5 minutes",
        options.defaultStaleTime ?? "0 minutes",
        options.defaultRefreshOnWindowFocus ?? true,
        yield* Effect.makeSemaphore(1),
    )
})

export declare namespace service {
    export interface Options extends make.Options {}
}

export const service = (options?: service.Options): Effect.Effect<QueryClientService, never, Scope.Scope> => Effect.tap(
    make(options),
    client => Effect.forkScoped(client.run),
)


export const QueryClientCacheKeyTypeId: unique symbol = Symbol.for("@effect-fc/QueryClient/QueryClientCacheKey")
export type QueryClientCacheKeyTypeId = typeof QueryClientCacheKeyTypeId

export class QueryClientCacheKey
extends Pipeable.Class()
implements Pipeable.Pipeable, Equal.Equal {
    readonly [QueryClientCacheKeyTypeId]: QueryClientCacheKeyTypeId = QueryClientCacheKeyTypeId

    constructor(
        readonly key: Query.Query.AnyKey,
        readonly f: (key: Query.Query.AnyKey) => Effect.Effect<unknown, unknown, unknown>,
    ) {
        super()
    }

    [Equal.symbol](that: Equal.Equal) {
        return isQueryClientCacheKey(that) && Equivalence.array(Equal.equivalence())(this.key, that.key) && Equivalence.strict()(this.f, that.f)
    }
    [Hash.symbol]() {
        return Hash.combine(Hash.hash(this.f))(Hash.array(this.key))
    }
}

export const isQueryClientCacheKey = (u: unknown): u is QueryClientCacheKey => Predicate.hasProperty(u, QueryClientCacheKeyTypeId)


export const QueryClientCacheEntryTypeId: unique symbol = Symbol.for("@effect-fc/QueryClient/QueryClientCacheEntry")
export type QueryClientCacheEntryTypeId = typeof QueryClientCacheEntryTypeId

export class QueryClientCacheEntry
extends Pipeable.Class()
implements Pipeable.Pipeable {
    readonly [QueryClientCacheEntryTypeId]: QueryClientCacheEntryTypeId = QueryClientCacheEntryTypeId

    constructor(
        readonly result: Result.Success<unknown>,
        readonly staleTime: Duration.DurationInput,
        readonly createdAt: DateTime.DateTime,
        readonly lastAccessedAt: DateTime.DateTime,
    ) {
        super()
    }
}

export const isQueryClientCacheEntry = (u: unknown): u is QueryClientCacheEntry => Predicate.hasProperty(u, QueryClientCacheEntryTypeId)

export const isQueryClientCacheEntryStale = (
    self: QueryClientCacheEntry
): Effect.Effect<boolean> => Effect.andThen(
    DateTime.now,
    now => Duration.greaterThanOrEqualTo(DateTime.distanceDuration(self.createdAt, now), self.staleTime),
)
