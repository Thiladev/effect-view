import { Cause, Deferred, Effect, Fiber, Option, type Scope, Stream } from "effect"
import { AsyncResult } from "effect/reactivity"
import { describe, expect, it } from "vitest"
import * as Mutation from "./Mutation.js"
import * as View from "./View.js"


const runMutationTest = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) =>
    Effect.runPromise(Effect.scoped(effect))

const currentFiber = <K, A, E, R>(mutation: Mutation.Mutation<K, A, E, R>) => Effect.flatMap(
    View.get(mutation.operation),
    Option.match({
        onSome: operation => View.get(operation.fiber),
        onNone: () => Effect.succeedNone,
    }),
)

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
                fiber: yield* currentFiber(mutation),
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

    it("mutateStream returns without waiting for completion, and streams the states until settled", async () => {
        const result = await runMutationTest(Effect.gen(function*() {
            const deferred = yield* Deferred.make<string>()
            const mutation = yield* Mutation.make({
                f: (_key: string) => Deferred.await(deferred),
            })

            const stream = yield* mutation.mutateStream("save")
            const states = yield* Effect.forkScoped(Stream.runCollect(stream))
            yield* Effect.yieldNow
            const hasRunningFiber = Option.isSome(yield* currentFiber(mutation))

            yield* Deferred.succeed(deferred, "saved")

            return {
                states: yield* Fiber.join(states).pipe(Effect.timeout("1 second")),
                hasRunningFiber,
            }
        }))

        expect(result.hasRunningFiber).toBe(true)
        expect(result.states).toHaveLength(2)

        const [pending, final] = result.states
        expect(pending.key.value).toBe("save")
        expect(AsyncResult.isInitial(pending.result)).toBe(true)
        expect(pending.result.waiting).toBe(true)
        expect(final.key.value).toBe("save")
        expect(expectSuccessValue(final)).toBe("saved")
    })

    it("exposes the most recently started operation", async () => {
        const result = await runMutationTest(Effect.gen(function*() {
            const mutation = yield* Mutation.make({
                f: (key: string) => Effect.succeed(key),
            })

            yield* mutation.mutate("a")
            yield* mutation.mutate("b")
            return Option.map(yield* View.get(mutation.operation), operation => operation.key)
        }))

        expect(result).toEqual(Option.some(Option.some("b")))
    })

    it("an older mutation finishing late does not overwrite the newer state", async () => {
        const result = await runMutationTest(Effect.gen(function*() {
            const slow = yield* Deferred.make<string>()
            const mutation = yield* Mutation.make({
                f: (key: string) => key === "a" ? Deferred.await(slow) : Effect.succeed(key),
            })

            yield* Effect.asVoid(mutation.mutateStream("a"))
            yield* Effect.yieldNow
            yield* mutation.mutate("b")

            yield* Deferred.succeed(slow, "a")
            yield* Effect.sleep("10 millis")

            return {
                state: yield* View.get(mutation.state),
                latestFinalState: yield* View.get(mutation.latestFinalState),
            }
        }))

        expect(result.state.key).toEqual(Option.some("b"))
        expect(expectSuccessValue(result.state)).toBe("b")
        expect(Option.map(result.latestFinalState, s => s.key.value)).toEqual(Option.some("b"))
    })
})
