import { type Cause, type Context, type Duration, Effect, Equal, Fiber, identity, Option, Pipeable, Predicate, type Scope, Stream, Subscribable, SubscriptionRef } from "effect"
import * as QueryClient from "./QueryClient.js"
import * as Result from "./Result.js"


export const QueryTypeId: unique symbol = Symbol.for("@effect-fc/Query/Query")
export type QueryTypeId = typeof QueryTypeId

export interface Query<in out K extends Query.AnyKey, in out A, in out KE = never, in out KR = never, in out E = never, in out R = never, in out P = never>
extends Pipeable.Pipeable {
    readonly [QueryTypeId]: QueryTypeId

    readonly context: Context.Context<Scope.Scope | QueryClient.QueryClient | R>
    readonly key: Stream.Stream<K, KE, KR>
    readonly f: (key: K) => Effect.Effect<A, E, R>
    readonly initialProgress: P

    readonly staleTime: Duration.DurationInput
    readonly refreshOnWindowFocus: boolean

    readonly latestKey: Subscribable.Subscribable<Option.Option<K>>
    readonly fiber: Subscribable.Subscribable<Option.Option<Fiber.Fiber<A, E>>>
    readonly result: Subscribable.Subscribable<Result.Result<A, E, P>>
    readonly latestFinalResult: Subscribable.Subscribable<Option.Option<Result.Final<A, E, P>>>

    readonly run: Effect.Effect<void>
    fetch(key: K): Effect.Effect<Result.Final<A, E, P>>
    fetchSubscribable(key: K): Effect.Effect<Subscribable.Subscribable<Result.Result<A, E, P>>>
    readonly refresh: Effect.Effect<Result.Final<A, E, P>, Cause.NoSuchElementException>
    readonly refreshSubscribable: Effect.Effect<Subscribable.Subscribable<Result.Result<A, E, P>>, Cause.NoSuchElementException>

    readonly invalidateCache: Effect.Effect<void>
    invalidateCacheEntry(key: K): Effect.Effect<void>
}

export declare namespace Query {
    export type AnyKey = readonly any[]
}

export class QueryImpl<in out K extends Query.AnyKey, in out A, in out KE = never, in out KR = never, in out E = never, in out R = never, in out P = never>
extends Pipeable.Class() implements Query<K, A, KE, KR, E, R, P> {
    readonly [QueryTypeId]: QueryTypeId = QueryTypeId

    constructor(
        readonly context: Context.Context<Scope.Scope | QueryClient.QueryClient | KR | R>,
        readonly key: Stream.Stream<K, KE, KR>,
        readonly f: (key: K) => Effect.Effect<A, E, R>,
        readonly initialProgress: P,

        readonly staleTime: Duration.DurationInput,
        readonly refreshOnWindowFocus: boolean,

        readonly latestKey: SubscriptionRef.SubscriptionRef<Option.Option<K>>,
        readonly fiber: SubscriptionRef.SubscriptionRef<Option.Option<Fiber.Fiber<A, E>>>,
        readonly result: SubscriptionRef.SubscriptionRef<Result.Result<A, E, P>>,
        readonly latestFinalResult: SubscriptionRef.SubscriptionRef<Option.Option<Result.Final<A, E, P>>>,

        readonly runSemaphore: Effect.Semaphore,
    ) {
        super()
    }

    get run(): Effect.Effect<void> {
        return Effect.all([
            Stream.runForEach(this.key, key => this.fetchSubscribable(key)),

            Effect.promise(() => import("@effect/platform-browser")).pipe(
                Effect.andThen(({ BrowserStream }) => this.refreshOnWindowFocus
                    ? Stream.runForEach(
                        BrowserStream.fromEventListenerWindow("focus"),
                        () => this.refreshSubscribable,
                    )
                    : Effect.void
                ),
                Effect.catchAllDefect(() => Effect.void),
            ),
        ], { concurrency: "unbounded" }).pipe(
            Effect.ignore,
            this.runSemaphore.withPermits(1),
            Effect.provide(this.context),
        )
    }

    get interrupt(): Effect.Effect<void> {
        return Effect.andThen(this.fiber, Option.match({
            onSome: Fiber.interrupt,
            onNone: () => Effect.void,
        }))
    }

    fetch(key: K): Effect.Effect<Result.Final<A, E, P>> {
        return this.interrupt.pipe(
            Effect.andThen(SubscriptionRef.set(this.latestKey, Option.some(key))),
            Effect.andThen(this.latestFinalResult),
            Effect.andThen(previous => this.startCached(key, Option.isSome(previous)
                ? Result.willFetch(previous.value) as Result.Final<A, E, P>
                : Result.initial()
            )),
            Effect.andThen(sub => this.watch(key, sub)),
            Effect.provide(this.context),
        )
    }

    fetchSubscribable(key: K): Effect.Effect<Subscribable.Subscribable<Result.Result<A, E, P>>> {
        return this.interrupt.pipe(
            Effect.andThen(SubscriptionRef.set(this.latestKey, Option.some(key))),
            Effect.andThen(this.latestFinalResult),
            Effect.andThen(previous => this.startCached(key, Option.isSome(previous)
                ? Result.willFetch(previous.value) as Result.Final<A, E, P>
                : Result.initial()
            )),
            Effect.tap(sub => Effect.forkScoped(this.watch(key, sub))),
            Effect.provide(this.context),
        )
    }

    get refresh(): Effect.Effect<Result.Final<A, E, P>, Cause.NoSuchElementException> {
        return this.interrupt.pipe(
            Effect.andThen(Effect.Do),
            Effect.bind("latestKey", () => Effect.andThen(this.latestKey, identity)),
            Effect.bind("latestFinalResult", () => this.latestFinalResult),
            Effect.bind("subscribable", ({ latestKey, latestFinalResult }) =>
                this.startCached(latestKey, Option.isSome(latestFinalResult)
                    ? Result.willRefresh(latestFinalResult.value) as Result.Final<A, E, P>
                    : Result.initial()
                )
            ),
            Effect.andThen(({ latestKey, subscribable }) => this.watch(latestKey, subscribable)),
            Effect.provide(this.context),
        )
    }

    get refreshSubscribable(): Effect.Effect<
        Subscribable.Subscribable<Result.Result<A, E, P>>,
        Cause.NoSuchElementException
    > {
        return this.interrupt.pipe(
            Effect.andThen(Effect.Do),
            Effect.bind("latestKey", () => Effect.andThen(this.latestKey, identity)),
            Effect.bind("latestFinalResult", () => this.latestFinalResult),
            Effect.bind("subscribable", ({ latestKey, latestFinalResult }) =>
                this.startCached(latestKey, Option.isSome(latestFinalResult)
                    ? Result.willRefresh(latestFinalResult.value) as Result.Final<A, E, P>
                    : Result.initial()
                )
            ),
            Effect.tap(({ latestKey, subscribable }) => Effect.forkScoped(this.watch(latestKey, subscribable))),
            Effect.map(({ subscribable }) => subscribable),
            Effect.provide(this.context),
        )
    }

    startCached(
        key: K,
        initial: Result.Initial | Result.Final<A, E, P>,
    ): Effect.Effect<
        Subscribable.Subscribable<Result.Result<A, E, P>>,
        never,
        Scope.Scope | QueryClient.QueryClient | R
    > {
        return Effect.andThen(this.getCacheEntry(key), Option.match({
            onSome: entry => Effect.andThen(
                QueryClient.isQueryClientCacheEntryStale(entry),
                isStale => isStale
                    ? this.start(key, Result.willRefresh(entry.result) as Result.Final<A, E, P>)
                    : Effect.succeed(Subscribable.make({
                        get: Effect.succeed(entry.result as Result.Result<A, E, P>),
                        get changes() { return Stream.make(entry.result as Result.Result<A, E, P>) },
                    })),
            ),
            onNone: () => this.start(key, initial),
        }))
    }

    start(
        key: K,
        initial: Result.Initial | Result.Final<A, E, P>,
    ): Effect.Effect<
        Subscribable.Subscribable<Result.Result<A, E, P>>,
        never,
        Scope.Scope | R
    > {
        return Result.unsafeForkEffect(
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
                initial,
                initialProgress: this.initialProgress,
            } as Result.unsafeForkEffect.Options<A, E, P>,
        ).pipe(
            Effect.tap(([, fiber]) => SubscriptionRef.set(this.fiber, Option.some(fiber))),
            Effect.map(([sub]) => sub),
        )
    }

    watch(
        key: K,
        sub: Subscribable.Subscribable<Result.Result<A, E, P>>
    ): Effect.Effect<Result.Final<A, E, P>, never, QueryClient.QueryClient> {
        return sub.get.pipe(
            Effect.andThen(initial => Stream.runFoldEffect(
                sub.changes,
                initial,
                (_, result) => Effect.as(SubscriptionRef.set(this.result, result), result),
            ) as Effect.Effect<Result.Final<A, E, P>>),
            Effect.tap(result => SubscriptionRef.set(this.latestFinalResult, Option.some(result))),
            Effect.tap(result => Result.isSuccess(result)
                ? this.setCacheEntry(key, result)
                : Effect.void
            ),
        )
    }

    makeCacheKey(key: K): QueryClient.QueryClientCacheKey {
        return new QueryClient.QueryClientCacheKey(key, this.f as (key: Query.AnyKey) => Effect.Effect<unknown, unknown, unknown>)
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
        result: Result.Success<A>,
    ): Effect.Effect<QueryClient.QueryClientCacheEntry, never, QueryClient.QueryClient> {
        return Effect.andThen(
            Effect.all([
                Effect.succeed(this.makeCacheKey(key)),
                QueryClient.QueryClient,
            ]),
            ([key, client]) => client.setCacheEntry(key, result, this.staleTime),
        )
    }

    get invalidateCache(): Effect.Effect<void> {
        return QueryClient.QueryClient.pipe(
            Effect.andThen(client => client.invalidateCacheEntries(this.f as (key: Query.AnyKey) => Effect.Effect<unknown, unknown, unknown>)),
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

export const isQuery = (u: unknown): u is Query<readonly unknown[], unknown> => Predicate.hasProperty(u, QueryTypeId)

export declare namespace make {
    export interface Options<K extends Query.AnyKey, A, KE = never, KR = never, E = never, R = never, P = never> {
        readonly key: Stream.Stream<K, KE, KR>
        readonly f: (key: NoInfer<K>) => Effect.Effect<A, E, Result.forkEffect.InputContext<R, NoInfer<P>>>
        readonly initialProgress?: P
        readonly staleTime?: Duration.DurationInput
        readonly refreshOnWindowFocus?: boolean
    }
}

export const make = Effect.fnUntraced(function* <K extends Query.AnyKey, A, KE = never, KR = never, E = never, R = never, P = never>(
    options: make.Options<K, A, KE, KR, E, R, P>
): Effect.fn.Return<
    Query<K, A, KE, KR, E, Result.forkEffect.OutputContext<A, E, R, P>, P>,
    never,
    Scope.Scope | QueryClient.QueryClient | KR | Result.forkEffect.OutputContext<A, E, R, P>
> {
    const client = yield* QueryClient.QueryClient

    return new QueryImpl(
        yield* Effect.context<Scope.Scope | QueryClient.QueryClient | KR | Result.forkEffect.OutputContext<A, E, R, P>>(),
        options.key,
        options.f as any,
        options.initialProgress as P,

        options.staleTime ?? client.defaultStaleTime,
        options.refreshOnWindowFocus ?? client.defaultRefreshOnWindowFocus,

        yield* SubscriptionRef.make(Option.none<K>()),
        yield* SubscriptionRef.make(Option.none<Fiber.Fiber<A, E>>()),
        yield* SubscriptionRef.make(Result.initial<A, E, P>()),
        yield* SubscriptionRef.make(Option.none<Result.Final<A, E, P>>()),

        yield* Effect.makeSemaphore(1),
    )
})

export const service = <K extends Query.AnyKey, A, KE = never, KR = never, E = never, R = never, P = never>(
    options: make.Options<K, A, KE, KR, E, R, P>
): Effect.Effect<
    Query<K, A, KE, KR, E, Result.forkEffect.OutputContext<A, E, R, P>, P>,
    never,
    Scope.Scope | QueryClient.QueryClient | KR | Result.forkEffect.OutputContext<A, E, R, P>
> => Effect.tap(
    make(options),
    query => Effect.forkScoped(query.run),
)
