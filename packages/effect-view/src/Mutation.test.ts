import { Cause, Deferred, Effect, Option, type Scope } from "effect"
import { AsyncResult } from "effect/unstable/reactivity"
import { describe, expect, it } from "vitest"
import * as Mutation from "./Mutation.js"
import * as View from "./View.js"


const runMutationTest = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) =>
    Effect.runPromise(Effect.scoped(effect))

const expectSuccessValue = <A, E>(state: { readonly result: AsyncResult.AsyncResult<A, E> }): A => {
    expect(AsyncResult.isSuccess(state.result)).toBe(true)

    if (!AsyncResult.isSuccess(state.result))
        throw new Error(`Expected Success result, received ${state.result._tag}`)

    return state.result.value
}

describe("Mutation", () => {
    it("runs a mutation and exposes its latest completed state", async () => {
        const result = await runMutationTest(Effect.gen(function*() {
            const mutation = yield* Mutation.make({
                f: (key: number) => Effect.succeed(`value:${key}`),
            })

            const final = yield* mutation.mutate(1)

            return {
                isMutation: Mutation.isMutation(mutation),
                final,
                latestKey: yield* View.get(mutation.latestKey),
                state: yield* View.get(mutation.state),
                latestFinalState: yield* View.get(mutation.latestFinalState),
                fiber: yield* View.get(mutation.fiber),
            }
        }))

        expect(result.isMutation).toBe(true)
        expect(result.final.key.value).toBe(1)
        expect(expectSuccessValue(result.final)).toBe("value:1")
        expect(result.latestKey).toEqual(Option.some(1))
        expect(result.state.key).toEqual(Option.some(1))
        expect(expectSuccessValue(result.state)).toBe("value:1")
        expect(result.latestFinalState).toEqual(Option.some(result.final))
        expect(result.fiber).toEqual(Option.none())
    })

    it("records failures while retaining the previous successful value", async () => {
        const result = await runMutationTest(Effect.gen(function*() {
            let calls = 0
            const mutation = yield* Mutation.make({
                f: (_key: "save") => Effect.sync(() => {
                    calls += 1
                    return calls
                }).pipe(
                    Effect.flatMap(call => call === 1
                        ? Effect.succeed("saved")
                        : Effect.fail("could not save")),
                ),
            })

            yield* mutation.mutate("save")
            return yield* mutation.mutate("save")
        }))

        expect(result.key.value).toBe("save")
        expect(AsyncResult.isFailure(result.result)).toBe(true)

        if (!AsyncResult.isFailure(result.result))
            throw new Error(`Expected Failure result, received ${result.result._tag}`)

        expect(result.result.cause).toEqual(Cause.fail("could not save"))
        expect(Option.isSome(result.result.previousSuccess)).toBe(true)

        if (Option.isSome(result.result.previousSuccess))
            expect(result.result.previousSuccess.value.value).toBe("saved")
    })

    it("runs a second mutation with its own key, not the previous one", async () => {
        const result = await runMutationTest(Effect.gen(function*() {
            const calls: Array<string> = []
            const mutation = yield* Mutation.make({
                f: (key: string) => Effect.sync(() => {
                    calls.push(key)
                    return key
                }),
            })

            const first = yield* mutation.mutate("a")
            const second = yield* mutation.mutate("b")

            return { calls, first, second }
        }))

        expect(result.calls).toEqual(["a", "b"])
        expect(result.first.key.value).toBe("a")
        expect(expectSuccessValue(result.first)).toBe("a")
        expect(result.second.key.value).toBe("b")
        expect(expectSuccessValue(result.second)).toBe("b")
    })

    it("mutateView returns a waiting state without waiting for completion", async () => {
        const result = await runMutationTest(Effect.gen(function*() {
            const deferred = yield* Deferred.make<string>()
            const mutation = yield* Mutation.make({
                f: (_key: string) => Deferred.await(deferred),
            })

            const state = yield* mutation.mutateView("save")
            yield* Effect.yieldNow

            const pending = yield* View.get(state)
            const hasRunningFiber = Option.isSome(yield* View.get(mutation.fiber))

            yield* Deferred.succeed(deferred, "saved")
            yield* Effect.yieldNow

            const final = yield* View.get(mutation.latestFinalState).pipe(Effect.flatMap(Effect.fromOption))

            return { pending, hasRunningFiber, final }
        }))

        expect(result.pending.key.value).toBe("save")
        expect(AsyncResult.isInitial(result.pending.result)).toBe(true)
        expect(result.pending.result.waiting).toBe(true)
        expect(result.hasRunningFiber).toBe(true)
        expect(result.final.key.value).toBe("save")
        expect(expectSuccessValue(result.final)).toBe("saved")
    })
})
