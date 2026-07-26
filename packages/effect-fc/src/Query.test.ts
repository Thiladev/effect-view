import { Effect, Option, type Scope, Stream } from "effect"
import { describe, expect, it } from "vitest"
import * as Query from "./Query.js"
import * as QueryClient from "./QueryClient.js"
import * as Result from "./Result.js"


const runQueryTest = <A, E>(effect: Effect.Effect<A, E, QueryClient.QueryClient | Scope.Scope>) =>
    Effect.runPromise(Effect.scoped(effect.pipe(
        Effect.provide(QueryClient.QueryClient.Default),
    )))

const expectSuccessValue = <A, E, P>(
    result: Result.Result<A, E, P>,
): A => {
    expect(Result.isSuccess(result)).toBe(true)

    if (!Result.isSuccess(result))
        throw new Error(`Expected Success result, received ${result._tag}`)

    return result.value
}

const expectSomeValue = <A>(option: Option.Option<A>): A => {
    expect(Option.isSome(option)).toBe(true)

    if (!Option.isSome(option))
        throw new Error("Expected Some option, received None")

    return option.value
}

describe("Query", () => {
    it("fetch caches successful results until they are invalidated or stale", async () => {
        let calls = 0
        const key = Stream.empty as Stream.Stream<readonly [number]>

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
        expect(result[0]._tag).toBe("Success")
        expect(result[1]._tag).toBe("Success")
        expect(expectSuccessValue(result[0])).toBe("value:1:1")
        expect(expectSuccessValue(result[1])).toBe("value:1:1")
    })

    it("refresh reruns the latest query key", async () => {
        let calls = 0
        const key = Stream.empty as Stream.Stream<readonly [number]>

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

    it("invalidateCacheEntry forces the next fetch for that key to rerun", async () => {
        let calls = 0
        const key = Stream.empty as Stream.Stream<readonly [number]>

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
        const key = Stream.empty as Stream.Stream<readonly [number]>

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

    it("service starts the key stream automatically and updates latest state", async () => {
        let calls = 0
        const key = Stream.make([1] as const) as Stream.Stream<readonly [number]>

        const effect = Effect.gen(function*() {
            const query = yield* Query.service({
                key,
                f: ([id]: readonly [number]) => Effect.sync(() => {
                    calls += 1
                    return `value:${id}:${calls}`
                }),
                staleTime: "1 minute",
            })

            yield* Effect.sleep("10 millis")

            return {
                final: yield* query.result.get,
                latestKey: yield* query.latestKey.get,
                latestFinalResult: yield* query.latestFinalResult.get,
            }
        })

        const result = await runQueryTest(effect)

        expect(calls).toBe(1)
        expect(expectSuccessValue(result.final)).toBe("value:1:1")
        expect(expectSomeValue(result.latestKey)).toEqual([1])
        expect(expectSuccessValue(expectSomeValue(result.latestFinalResult))).toBe("value:1:1")
    })
})
