import { Deferred, Effect, Fiber, Layer, Option, Schedule, type Scope, Stream, SubscriptionRef } from "effect"
import { AsyncResult } from "effect/reactivity"
import { describe, expect, it } from "vitest"
import * as AppConnectivity from "./AppConnectivity.js"
import * as AppFocus from "./AppFocus.js"
import * as Lens from "./Lens.js"
import * as Query from "./Query.js"
import * as QueryClient from "./QueryClient.js"
import * as View from "./View.js"


const runQueryTest = <A, E>(effect: Effect.Effect<A, E, QueryClient.QueryClient | Scope.Scope>) =>
    Effect.runPromise(Effect.scoped(effect.pipe(
        Effect.provide(QueryClient.layer.pipe(
            Layer.provide(Layer.mergeAll(AppConnectivity.layerDummy, AppFocus.layerDummy)),
        )),
    )))

/** Runs `f` with an AppConnectivity whose online status is controlled through the returned ref. */
const withAppConnectivity = <A, E, R>(
    initial: boolean,
    f: (online: SubscriptionRef.SubscriptionRef<boolean>) => Effect.Effect<A, E, R>,
) => Effect.flatMap(
    SubscriptionRef.make(initial),
    online => Effect.provide(f(online), Layer.succeed(AppConnectivity.AppConnectivity, AppConnectivity.make(Lens.fromSubscriptionRef(online)))),
)

/** Runs `f` with an AppFocus whose focus is controlled through the returned ref. */
const withAppFocus = <A, E, R>(
    initial: boolean,
    f: (focused: SubscriptionRef.SubscriptionRef<boolean>) => Effect.Effect<A, E, R>,
) => Effect.flatMap(
    SubscriptionRef.make(initial),
    focused => Effect.provide(f(focused), Layer.succeed(AppFocus.AppFocus, AppFocus.make(Lens.fromSubscriptionRef(focused)))),
)

const staticKey = <K>(key: K): View.View<K> => View.make({
    get: Effect.succeed(key),
    changes: Stream.make(key),
})

describe("Query network mode", () => {
    it("in online mode, a request made offline is paused until the connection returns", async () => {
        const result = await runQueryTest(withAppConnectivity(false, online => Effect.gen(function*() {
            let calls = 0
            const query = yield* Query.make({
                key: staticKey(1),
                f: (id: number) => Effect.sync(() => {
                    calls += 1
                    return `value:${id}`
                }),
            })

            const stream = yield* query.fetchStream(1)
            const states = yield* Effect.forkScoped(Stream.runCollect(stream))
            yield* Effect.yieldNow

            const whileOffline = { calls, state: yield* View.get(query.state) }
            yield* SubscriptionRef.set(online, true)

            return {
                whileOffline,
                states: yield* Fiber.join(states).pipe(Effect.timeout("1 second")),
                calls,
            }
        })))

        expect(result.whileOffline.calls).toBe(0)
        expect(result.whileOffline.state.paused).toBe(true)
        expect(result.whileOffline.state.result.waiting).toBe(true)

        expect(result.calls).toBe(1)
        // The stream starts from the current state, which is already paused
        expect(result.states.map(s => [s.result._tag, s.result.waiting, s.paused])).toEqual([
            ["Initial", true, true],
            ["Initial", true, false],
            ["Success", false, false],
        ])
    })

    it("in always mode, requests ignore the connection", async () => {
        const result = await runQueryTest(withAppConnectivity(false, () => Effect.gen(function*() {
            const query = yield* Query.make({
                key: staticKey(1),
                f: (id: number) => Effect.succeed(`value:${id}`),
                networkMode: "always",
            })

            return yield* query.fetch(1).pipe(Effect.timeout("1 second"))
        })))

        expect(AsyncResult.isSuccess(result.result)).toBe(true)
        expect(result.paused).toBe(false)
    })

    it("interrupting a paused request leaves it neither paused nor waiting", async () => {
        const result = await runQueryTest(withAppConnectivity(false, () => Effect.gen(function*() {
            const query = yield* Query.make({
                key: staticKey(1),
                f: (id: number) => Effect.succeed(`value:${id}`),
            })

            const stream = yield* query.fetchStream(1)
            yield* Effect.yieldNow
            const operation = yield* View.get(query.operation)
            if (Option.isSome(operation))
                yield* operation.value.interrupt

            return {
                states: yield* Stream.runCollect(stream).pipe(Effect.timeout("1 second")),
                state: yield* View.get(query.state),
            }
        })))

        expect(result.state.paused).toBe(false)
        expect(result.state.result.waiting).toBe(false)
        expect(result.states.at(-1)?.paused).toBe(false)
    })

    it("refreshes a stale query when the connection returns", async () => {
        const result = await runQueryTest(withAppConnectivity(true, online => Effect.gen(function*() {
            let calls = 0
            const query = yield* Query.make({
                key: staticKey(1),
                f: (id: number) => Effect.sync(() => {
                    calls += 1
                    return `value:${id}:${calls}`
                }),
                staleTime: "0 millis",
            }).pipe(Query.thenRun)

            yield* Effect.sleep("10 millis")
            const afterStart = calls

            yield* SubscriptionRef.set(online, false)
            yield* Effect.sleep("10 millis")
            const whileOffline = calls

            yield* SubscriptionRef.set(online, true)
            yield* Effect.sleep("10 millis")

            return { afterStart, whileOffline, afterReconnect: calls, state: yield* View.get(query.state) }
        })))

        expect(result).toMatchObject({ afterStart: 1, whileOffline: 1, afterReconnect: 2 })
        expect(AsyncResult.isSuccess(result.state.result) && result.state.result.value).toBe("value:1:2")
    })

    it("reconnecting resumes a paused request instead of restarting it", async () => {
        const result = await runQueryTest(withAppConnectivity(false, online => Effect.gen(function*() {
            let started = 0
            let completed = 0
            const query = yield* Query.make({
                key: staticKey(1),
                f: (id: number) => Effect.gen(function*() {
                    started += 1
                    yield* Effect.sleep("5 millis")
                    completed += 1
                    return `value:${id}`
                }),
            }).pipe(Query.thenRun)

            yield* Effect.sleep("10 millis")
            const pausedWhileOffline = (yield* View.get(query.state)).paused

            yield* SubscriptionRef.set(online, true)
            yield* Effect.sleep("30 millis")

            return { pausedWhileOffline, started, completed, state: yield* View.get(query.state) }
        })))

        expect(result.pausedWhileOffline).toBe(true)
        expect(result.started).toBe(1)
        expect(result.completed).toBe(1)
        expect(AsyncResult.isSuccess(result.state.result)).toBe(true)
    })

    it("a focus or reconnect refresh does not restart a request that is already in flight", async () => {
        const result = await runQueryTest(withAppConnectivity(true, online => withAppFocus(true, focused => Effect.gen(function*() {
            let started = 0
            const query = yield* Query.make({
                key: staticKey(1),
                f: () => Effect.gen(function*() {
                    started += 1
                    yield* Effect.sleep("40 millis")
                    return started
                }),
                staleTime: "0 millis",
            }).pipe(Query.thenRun)

            yield* Effect.sleep("10 millis")
            yield* SubscriptionRef.set(focused, false)
            yield* SubscriptionRef.set(focused, true)
            yield* SubscriptionRef.set(online, false)
            yield* SubscriptionRef.set(online, true)
            yield* Effect.sleep("100 millis")

            return { started, state: yield* View.get(query.state) }
        }))))

        expect(result.started).toBe(1)
        expect(AsyncResult.isSuccess(result.state.result)).toBe(true)
    })

    it("does not refresh on reconnect when refreshOnReconnect is false", async () => {
        const calls = await runQueryTest(withAppConnectivity(true, online => Effect.gen(function*() {
            let calls = 0
            yield* Query.make({
                key: staticKey(1),
                f: () => Effect.sync(() => { calls += 1 }),
                staleTime: "0 millis",
                refreshOnReconnect: false,
            }).pipe(Query.thenRun)

            yield* Effect.sleep("10 millis")
            yield* SubscriptionRef.set(online, false)
            yield* SubscriptionRef.set(online, true)
            yield* Effect.sleep("10 millis")
            return calls
        })))

        expect(calls).toBe(1)
    })

    it("refreshes a stale query when the app becomes focused, but not at startup", async () => {
        const result = await runQueryTest(withAppFocus(true, focused => Effect.gen(function*() {
            let calls = 0
            const gate = yield* Deferred.make<void>()
            yield* Query.make({
                key: staticKey(1),
                f: () => Effect.andThen(Effect.sync(() => { calls += 1 }), Deferred.succeed(gate, undefined)),
                staleTime: "0 millis",
            }).pipe(Query.thenRun)

            yield* Deferred.await(gate)
            yield* Effect.sleep("10 millis")
            const afterStart = calls

            yield* SubscriptionRef.set(focused, false)
            yield* SubscriptionRef.set(focused, true)
            yield* Effect.sleep("10 millis")

            return { afterStart, afterFocus: calls }
        })))

        expect(result).toEqual({ afterStart: 1, afterFocus: 2 })
    })

    it("in offlineFirst mode, a request made offline runs right away", async () => {
        const result = await runQueryTest(withAppConnectivity(false, () => Effect.gen(function*() {
            const query = yield* Query.make({
                key: staticKey(1),
                f: (id: number) => Effect.succeed(`value:${id}`),
                networkMode: "offlineFirst",
            })

            return yield* query.fetch(1).pipe(Effect.timeout("1 second"))
        })))

        expect(AsyncResult.isSuccess(result.result)).toBe(true)
        expect(result.paused).toBe(false)
    })

    it("in offlineFirst mode, a request that fails offline is paused, then runs again when the connection returns", async () => {
        const result = await runQueryTest(withAppConnectivity(false, online => Effect.gen(function*() {
            let calls = 0
            const query = yield* Query.make({
                key: staticKey(1),
                f: (id: number) => Effect.suspend(() => {
                    calls += 1
                    return calls === 1 ? Effect.fail("offline") : Effect.succeed(`value:${id}`)
                }),
                networkMode: "offlineFirst",
            })

            const stream = yield* query.fetchStream(1)
            const states = yield* Effect.forkScoped(Stream.runCollect(stream))
            yield* Effect.yieldNow

            const whileOffline = { calls, state: yield* View.get(query.state) }
            yield* SubscriptionRef.set(online, true)

            return {
                whileOffline,
                states: yield* Fiber.join(states).pipe(Effect.timeout("1 second")),
                calls,
            }
        })))

        expect(result.whileOffline.calls).toBe(1)
        expect(result.whileOffline.state.paused).toBe(true)
        expect(result.whileOffline.state.result.waiting).toBe(true)

        expect(result.calls).toBe(2)
        const last = result.states.at(-1)
        expect(last && AsyncResult.isSuccess(last.result) && last.result.value).toBe("value:1")
        expect(last?.paused).toBe(false)
    })

    it("in offlineFirst mode, a request that fails online is not run again", async () => {
        const result = await runQueryTest(withAppConnectivity(true, () => Effect.gen(function*() {
            let calls = 0
            const query = yield* Query.make({
                key: staticKey(1),
                f: (_id: number) => Effect.suspend(() => {
                    calls += 1
                    return Effect.fail("error")
                }),
                networkMode: "offlineFirst",
            })

            return { final: yield* query.fetch(1).pipe(Effect.timeout("1 second")), calls }
        })))

        expect(AsyncResult.isFailure(result.final.result)).toBe(true)
        expect(result.calls).toBe(1)
    })

    it("refreshes a fresh query on focus only when refreshOnFocus is \"always\"", async () => {
        const result = await runQueryTest(withAppFocus(true, focused => Effect.gen(function*() {
            const calls = { true: 0, always: 0 }
            const makeQuery = (refreshOnFocus: true | "always") => Query.make({
                key: staticKey(refreshOnFocus),
                f: () => Effect.sync(() => { calls[refreshOnFocus === true ? "true" : "always"] += 1 }),
                staleTime: "1 hour",
                refreshOnFocus,
            }).pipe(Query.thenRun)

            yield* makeQuery(true)
            yield* makeQuery("always")
            yield* Effect.sleep("10 millis")
            yield* SubscriptionRef.set(focused, false)
            yield* SubscriptionRef.set(focused, true)
            yield* Effect.sleep("10 millis")

            return calls
        })))

        expect(result).toEqual({ true: 1, always: 2 })
    })

    it("refreshes a fresh query on reconnect when refreshOnReconnect is \"always\"", async () => {
        const calls = await runQueryTest(withAppConnectivity(true, online => Effect.gen(function*() {
            let calls = 0
            yield* Query.make({
                key: staticKey(1),
                f: () => Effect.sync(() => { calls += 1 }),
                staleTime: "1 hour",
                refreshOnReconnect: "always",
            }).pipe(Query.thenRun)

            yield* Effect.sleep("10 millis")
            yield* SubscriptionRef.set(online, false)
            yield* SubscriptionRef.set(online, true)
            yield* Effect.sleep("10 millis")
            return calls
        })))

        expect(calls).toBe(2)
    })
})

describe("browser layers", () => {
    it("AppConnectivity.layerBrowser follows the online and offline events", async () => {
        const values = await Effect.runPromise(Effect.gen(function*() {
            const { online } = yield* AppConnectivity.AppConnectivity
            const values = yield* Effect.forkScoped(Stream.runCollect(Stream.take(View.changes(online), 3)))
            yield* Effect.sleep("10 millis")

            window.dispatchEvent(new Event("offline"))
            window.dispatchEvent(new Event("online"))
            return yield* Fiber.join(values).pipe(Effect.timeout("1 second"))
        }).pipe(
            Effect.provide(AppConnectivity.layerBrowser),
            Effect.scoped,
        ))

        expect(values).toEqual([navigator.onLine, false, true])
    })

    it("AppFocus.layerBrowser follows the document's visibility", async () => {
        let visibilityState: DocumentVisibilityState = "visible"
        const setVisibility = (state: DocumentVisibilityState) => {
            visibilityState = state
            document.dispatchEvent(new Event("visibilitychange"))
        }
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibilityState })

        try {
            const values = await Effect.runPromise(Effect.gen(function*() {
                const { focused } = yield* AppFocus.AppFocus
                const values = yield* Effect.forkScoped(Stream.runCollect(Stream.take(View.changes(focused), 3)))
                yield* Effect.sleep("10 millis")

                setVisibility("hidden")
                setVisibility("visible")
                return yield* Fiber.join(values).pipe(Effect.timeout("1 second"))
            }).pipe(
                Effect.provide(AppFocus.layerBrowser),
                Effect.scoped,
            ))

            expect(values).toEqual([true, false, true])
        }
        finally {
            // Restores jsdom's own getter, from the prototype
            delete (document as { visibilityState?: unknown }).visibilityState
        }
    })
})

describe("withScheduledRefresh", () => {
    const countRefreshes = (focused: boolean, options?: Query.withScheduledRefresh.Options) =>
        runQueryTest(withAppFocus(focused, () => Effect.gen(function*() {
            let calls = 0
            yield* Query.make({
                key: staticKey(1),
                f: () => Effect.sync(() => { calls += 1 }),
                staleTime: "0 millis",
            }).pipe(
                Query.thenRun,
                Query.withScheduledRefresh(Schedule.spaced("10 millis").pipe(Schedule.upTo({ times: 2 })), options),
            )

            yield* Effect.sleep("100 millis")
            return calls
        })))

    it("refreshes while the app is focused", async () => {
        expect(await countRefreshes(true)).toBe(3)
    })

    it("skips refreshes while the app is not focused", async () => {
        expect(await countRefreshes(false)).toBe(1)
    })

    it("keeps refreshing while the app is not focused with refreshInBackground", async () => {
        expect(await countRefreshes(false, { refreshInBackground: true })).toBe(3)
    })
})
