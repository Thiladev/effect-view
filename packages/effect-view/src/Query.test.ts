import { Effect, Schedule, type Scope, Stream } from "effect"
import { TestClock } from "effect/testing"
import { AsyncResult } from "effect/unstable/reactivity"
import { describe, expect, it } from "vitest"
import * as Query from "./Query.js"
import * as QueryClient from "./QueryClient.js"
import * as View from "./View.js"


const runQueryTest = <A, E>(effect: Effect.Effect<A, E, QueryClient.QueryClient | Scope.Scope>) =>
    Effect.runPromise(Effect.scoped(effect.pipe(
        Effect.provide(QueryClient.layer()),
    )))

const staticKey = <K>(key: K): View.View<K> => View.make({
    get: Effect.succeed(key),
    changes: Stream.make(key),
})

const expectSuccessValue = <A, E>(
    state: Query.FinalQueryState<unknown, A, E>,
): A => {
    expect(AsyncResult.isSuccess(state.result)).toBe(true)

    if (!AsyncResult.isSuccess(state.result))
        throw new Error(`Expected Success result, received ${state.result._tag}`)

    return state.result.value
}

describe("Query", () => {
    it("fetch caches successful results until they are invalidated or stale", async () => {
        let calls = 0
        const key = staticKey<readonly [number]>([1])

        const result = await runQueryTest(Effect.gen(function*() {
            const query = yield* Query.make({
                key,
                f: ([id]: readonly [number]) => Effect.sync(() => {
                    calls += 1
                    return `value:${id}:${calls}`
                }),
                staleTime: "1 minute",
            })

            const first = yield* query.fetch([1])
            const second = yield* query.fetch([1])

            return [first, second] as const
        }))

        expect(calls).toBe(1)
        expect(expectSuccessValue(result[0])).toBe("value:1:1")
        expect(expectSuccessValue(result[1])).toBe("value:1:1")
    })

    it("refresh reruns the latest query key", async () => {
        let calls = 0
        const key = staticKey<readonly [number]>([1])

        const result = await runQueryTest(Effect.gen(function*() {
            const query = yield* Query.make({
                key,
                f: ([id]: readonly [number]) => Effect.sync(() => {
                    calls += 1
                    return `value:${id}:${calls}`
                }),
                staleTime: "0 millis",
            })

            const first = yield* query.fetch([1])
            yield* Effect.sleep("1 millis")
            const refreshed = yield* query.refresh

            return [first, refreshed] as const
        }))

        expect(calls).toBe(2)
        expect(expectSuccessValue(result[0])).toBe("value:1:1")
        expect(expectSuccessValue(result[1])).toBe("value:1:2")
    })

    it("withScheduledRefresh lets the Schedule control the first refresh", async () => {
        let calls = 0
        const key = staticKey<readonly [number]>([1])

        const result = await runQueryTest(Effect.gen(function*() {
            const query = yield* Query.make({
                key,
                f: () => Effect.sync(() => {
                    calls += 1
                    return calls
                }),
                staleTime: "0 millis",
            }).pipe(
                Query.thenRun,
                Query.withScheduledRefresh(
                    Schedule.spaced("1 second").pipe(
                        Schedule.upTo({ times: 1 }),
                    ),
                ),
            )

            yield* TestClock.adjust("999 millis")
            const beforeInterval = calls

            yield* TestClock.adjust("1 millis")
            const afterFirstInterval = calls

            return {
                isQuery: Query.isQuery(query),
                beforeInterval,
                afterFirstInterval,
            }
        }).pipe(
            Effect.provide(TestClock.layer()),
        ))

        expect(result).toEqual({
            isQuery: true,
            beforeInterval: 1,
            afterFirstInterval: 2,
        })
    })

    it("invalidateCacheEntry forces the next fetch for that key to rerun", async () => {
        let calls = 0
        const key = staticKey<readonly [number]>([1])

        const result = await runQueryTest(Effect.gen(function*() {
            const query = yield* Query.make({
                key,
                f: ([id]: readonly [number]) => Effect.sync(() => {
                    calls += 1
                    return `value:${id}:${calls}`
                }),
                staleTime: "1 minute",
            })

            const first = yield* query.fetch([1])
            yield* query.invalidateCacheEntry([1])
            const second = yield* query.fetch([1])

            return [first, second] as const
        }))

        expect(calls).toBe(2)
        expect(expectSuccessValue(result[0])).toBe("value:1:1")
        expect(expectSuccessValue(result[1])).toBe("value:1:2")
    })

    it("invalidateCache clears cached entries for the query function", async () => {
        let calls = 0
        const key = staticKey<readonly [number]>([1])

        const result = await runQueryTest(Effect.gen(function*() {
            const query = yield* Query.make({
                key,
                f: ([id]: readonly [number]) => Effect.sync(() => {
                    calls += 1
                    return `value:${id}:${calls}`
                }),
                staleTime: "1 minute",
            })

            const first = yield* query.fetch([1])
            yield* query.invalidateCache
            const second = yield* query.fetch([1])

            return [first, second] as const
        }))

        expect(calls).toBe(2)
        expect(expectSuccessValue(result[0])).toBe("value:1:1")
        expect(expectSuccessValue(result[1])).toBe("value:1:2")
    })

    it("service starts the key view automatically and records its latest final state", async () => {
        let calls = 0
        const key = staticKey<readonly [number]>([1])

        const effect = Effect.gen(function*() {
            const query = yield* Query.make({
                key,
                f: ([id]: readonly [number]) => Effect.sync(() => {
                    calls += 1
                    return `value:${id}:${calls}`
                }),
                staleTime: "1 minute",
            }).pipe(Query.thenRun)

            const latestFinalState = yield* Effect.sleep("1 millis").pipe(
                Effect.andThen(View.get(query.latestFinalState)),
                Effect.flatMap(Effect.fromOption),
                Effect.eventually,
                Effect.timeout("1 second"),
            )

            return {
                state: yield* View.get(query.state),
                latestFinalState,
            }
        })

        const result = await runQueryTest(effect)

        expect(calls).toBe(1)
        expect(result.state.key).toEqual([1])
        expect(expectSuccessValue(result.latestFinalState)).toBe("value:1:1")
    })
})
