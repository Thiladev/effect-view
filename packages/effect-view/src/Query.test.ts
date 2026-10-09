import { Deferred, Effect, Exit, Fiber, Option, Schedule, type Scope, Stream } from "effect"
import { AsyncResult } from "effect/reactivity"
import { TestClock } from "effect/testing"
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
    state: Query.QueryFinalState<unknown, A, E>,
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

    it("a superseded fetch does not overwrite the newer state", async () => {
        const result = await runQueryTest(Effect.gen(function*() {
            const never = yield* Deferred.make<string>()
            const query = yield* Query.make({
                key: staticKey(1),
                f: (id: number) => id === 1 ? Deferred.await(never) : Effect.succeed(`value:${id}`),
            })

            yield* Effect.asVoid(query.fetchStream(1))
            yield* Effect.yieldNow
            const second = yield* query.fetch(2)
            yield* Effect.sleep("10 millis")

            return {
                second,
                state: yield* View.get(query.state),
                latestFinalState: yield* View.get(query.latestFinalState),
            }
        }))

        expect(expectSuccessValue(result.second)).toBe("value:2")
        expect(result.state.key).toBe(2)
        expect(result.state.result.waiting).toBe(false)
        expect(Option.map(result.latestFinalState, s => s.key)).toEqual(Option.some(2))
    })

    it("an interrupted fetch is not recorded as a final state", async () => {
        const result = await runQueryTest(Effect.gen(function*() {
            const never = yield* Deferred.make<string>()
            const query = yield* Query.make({
                key: staticKey(1),
                f: (_id: number) => Deferred.await(never),
            })

            yield* Effect.asVoid(query.fetchStream(1))
            yield* Effect.yieldNow
            yield* Effect.asVoid(query.fetchStream(2))
            yield* Effect.sleep("10 millis")

            return {
                state: yield* View.get(query.state),
                latestFinalState: yield* View.get(query.latestFinalState),
            }
        }))

        expect(result.state.key).toBe(2)
        expect(result.latestFinalState).toEqual(Option.none())
    })

    it("a superseded fetch is interrupted, and its state stops waiting", async () => {
        const result = await runQueryTest(Effect.gen(function*() {
            const never = yield* Deferred.make<string>()
            const query = yield* Query.make({
                key: staticKey(1),
                f: (id: number) => id === 1 ? Deferred.await(never) : Effect.succeed(`value:${id}`),
            })

            const firstFetch = yield* Effect.forkScoped(query.fetch(1))
            yield* Effect.yieldNow
            const first = yield* query.fetchStream(1)
            yield* query.fetch(2)

            return {
                firstFetch: yield* Fiber.await(firstFetch),
                firstStates: yield* Stream.runCollect(first).pipe(Effect.timeout("1 second")),
            }
        }))

        expect(Exit.hasInterrupts(result.firstFetch)).toBe(true)
        expect(result.firstStates.at(-1)?.result.waiting).toBe(false)
    })

    it("fetchStream ends once the fetch settles, and gives the final state to late subscribers", async () => {
        const result = await runQueryTest(Effect.gen(function*() {
            const gate = yield* Deferred.make<void>()
            const query = yield* Query.make({
                key: staticKey(1),
                f: (id: number) => Effect.as(Deferred.await(gate), `value:${id}`),
            })

            const stream = yield* query.fetchStream(1)
            const early = yield* Effect.forkScoped(Stream.runCollect(stream))
            yield* Effect.yieldNow
            yield* Deferred.succeed(gate, undefined)

            const earlyStates = yield* Fiber.join(early).pipe(Effect.timeout("1 second"))
            const lateStates = yield* Stream.runCollect(stream).pipe(Effect.timeout("1 second"))
            return { earlyStates, lateStates }
        }))

        expect(result.earlyStates.map(s => [s.result._tag, s.result.waiting])).toEqual([
            ["Initial", true],
            ["Success", false],
        ])
        expect(result.lateStates.map(s => s.result._tag)).toEqual(["Success"])
    })

    it("fetchStream ends once the fetch is aborted", async () => {
        const result = await runQueryTest(Effect.gen(function*() {
            const never = yield* Deferred.make<string>()
            const query = yield* Query.make({
                key: staticKey(1),
                f: (id: number) => id === 1 ? Deferred.await(never) : Effect.succeed(`value:${id}`),
            })

            const stream = yield* query.fetchStream(1)
            const states = yield* Effect.forkScoped(Stream.runCollect(stream))
            yield* Effect.yieldNow
            yield* query.fetch(2)

            return yield* Fiber.join(states).pipe(Effect.timeout("1 second"))
        }))

        expect(result.at(-1)?.result.waiting).toBe(false)
    })

    it("exposes the current operation, replaced by each new request", async () => {
        const result = await runQueryTest(Effect.gen(function*() {
            const query = yield* Query.make({
                key: staticKey(1),
                f: (id: number) => Effect.succeed(`value:${id}`),
            })

            const before = yield* View.get(query.operation)
            yield* query.fetch(1)
            const first = yield* View.get(query.operation)
            yield* query.fetch(2)
            const second = yield* View.get(query.operation)

            return {
                before: Option.isNone(before),
                firstKey: Option.map(first, operation => operation.key),
                secondKey: Option.map(second, operation => operation.key),
            }
        }))

        expect(result).toEqual({
            before: true,
            firstKey: Option.some(1),
            secondKey: Option.some(2),
        })
    })

    it("concurrent fetches superseding a running fetch leave a single running fiber", async () => {
        const result = await runQueryTest(Effect.gen(function*() {
            const never = yield* Deferred.make<string>()
            let running = 0
            const query = yield* Query.make({
                key: staticKey(1),
                f: (_id: number) => Effect.suspend(() => {
                    running += 1
                    return Deferred.await(never)
                }).pipe(
                    // Asynchronous cleanup (e.g. aborting a request), so that interrupting it suspends
                    Effect.ensuring(Effect.andThen(Effect.sleep("1 millis"), Effect.sync(() => { running -= 1 }))),
                ),
            })

            yield* Effect.asVoid(query.fetchStream(0))
            yield* Effect.yieldNow
            yield* Effect.all([query.fetchStream(1), query.fetchStream(2)], { concurrency: "unbounded", discard: true })
            yield* Effect.sleep("10 millis")
            return running
        }))

        expect(result).toBe(1)
    })

    it("concurrent fetches never leave an orphaned running fiber", async () => {
        const result = await runQueryTest(Effect.gen(function*() {
            const never = yield* Deferred.make<string>()
            let running = 0
            const query = yield* Query.make({
                key: staticKey(1),
                f: (_id: number) => Effect.suspend(() => {
                    running += 1
                    return Deferred.await(never)
                }).pipe(
                    Effect.ensuring(Effect.sync(() => { running -= 1 })),
                ),
            })

            yield* Effect.all([query.fetchStream(1), query.fetchStream(2)], { concurrency: "unbounded" })
            yield* Effect.sleep("10 millis")
            const runningBeforeInterrupt = running
            const operation = yield* View.get(query.operation)
            if (Option.isSome(operation))
                yield* operation.value.interrupt
            yield* Effect.sleep("10 millis")

            return { runningBeforeInterrupt, runningAfterInterrupt: running }
        }))

        expect(result).toEqual({ runningBeforeInterrupt: 1, runningAfterInterrupt: 0 })
    })
})
