import { DateTime, Duration, Effect, Equal, Equivalence, Hash, HashMap, Pipeable, Predicate, type Scope, SubscriptionRef } from "effect"
import type * as Query from "./Query.js"
import type * as Result from "./Result.js"


export const QueryClientServiceTypeId: unique symbol = Symbol.for("@effect-fc/QueryClient/QueryClientServiceTypeId")
export type QueryClientServiceTypeId = typeof QueryClientServiceTypeId

export interface QueryClientService extends Pipeable.Pipeable {
    readonly [QueryClientServiceTypeId]: QueryClientServiceTypeId
    readonly cache: SubscriptionRef.SubscriptionRef<HashMap.HashMap<QueryClientCacheKey, QueryClientCacheEntry>>
    readonly gcTime: Duration.DurationInput
    readonly defaultStaleTime: Duration.DurationInput
    readonly defaultRefreshOnWindowFocus: boolean
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
        readonly gcTime: Duration.DurationInput,
        readonly defaultStaleTime: Duration.DurationInput,
        readonly defaultRefreshOnWindowFocus: boolean,
        readonly runSemaphore: Effect.Semaphore,
    ) {
        super()
    }
}

export const isQueryClientService = (u: unknown): u is QueryClientService => Predicate.hasProperty(u, QueryClientServiceTypeId)

export declare namespace make {
    export interface Options {
        readonly gcTime?: Duration.DurationInput
        readonly defaultStaleTime?: Duration.DurationInput
        readonly defaultRefreshOnWindowFocus?: boolean
    }
}

export const make = Effect.fnUntraced(function* (options: make.Options = {}): Effect.fn.Return<QueryClientService> {
    return new QueryClientServiceImpl(
        yield* SubscriptionRef.make(HashMap.empty<QueryClientCacheKey, QueryClientCacheEntry>()),
        options.gcTime ?? "5 minutes",
        options.defaultStaleTime ?? "0 minutes",
        options.defaultRefreshOnWindowFocus ?? true,
        yield* Effect.makeSemaphore(1),
    )
})

export const run = (_self: QueryClientService): Effect.Effect<void> => Effect.void

export declare namespace service {
    export interface Options extends make.Options {}
}

export const service = (options?: service.Options): Effect.Effect<QueryClientService, never, Scope.Scope> => Effect.tap(
    make(options),
    client => Effect.forkScoped(run(client)),
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
        readonly createdAt: DateTime.DateTime,
    ) {
        super()
    }
}

export const isQueryClientCacheEntry = (u: unknown): u is QueryClientCacheEntry => Predicate.hasProperty(u, QueryClientCacheEntryTypeId)

export const isQueryClientCacheEntryStale = (
    self: QueryClientCacheEntry,
    staleTime: Duration.DurationInput,
): Effect.Effect<boolean> => Effect.andThen(
    DateTime.now,
    now => Duration.greaterThanOrEqualTo(DateTime.distanceDuration(self.createdAt, now), staleTime),
)
