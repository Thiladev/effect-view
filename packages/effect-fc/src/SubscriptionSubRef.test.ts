import { describe, expect, test } from "bun:test"
import { Chunk, Effect, Ref, SubscriptionRef } from "effect"
import * as SubscriptionSubRef from "./SubscriptionSubRef.js"


describe("SubscriptionSubRef with array refs", () => {
    test("creates a subref for a single array element using path", async () => {
        const value = await Effect.runPromise(
            Effect.flatMap(
                SubscriptionRef.make([{ name: "alice" }, { name: "bob" }, { name: "charlie" }]),
                parent => {
                    const subref = SubscriptionSubRef.makeFromPath(parent, [1, "name"])
                    return subref.get
                },
            ),
        )

        expect(value).toBe("bob")
    })

    test("modifies a single array element via subref", async () => {
        const result = await Effect.runPromise(
            Effect.flatMap(
                SubscriptionRef.make([{ name: "alice" }, { name: "bob" }, { name: "charlie" }]),
                parent => {
                    const subref = SubscriptionSubRef.makeFromPath(parent, [1, "name"])
                    return Effect.flatMap(
                        Ref.set(subref, "bob-updated"),
                        () => Ref.get(parent),
                    )
                },
            ),
        )

        expect(result).toEqual([{ name: "alice" }, { name: "bob-updated" }, { name: "charlie" }])
    })

    test("modifies array element at index 0", async () => {
        const result = await Effect.runPromise(
            Effect.flatMap(
                SubscriptionRef.make([10, 20, 30]),
                parent => {
                    const subref = SubscriptionSubRef.makeFromPath(parent, [0])
                    return Effect.flatMap(
                        Ref.set(subref, 99),
                        () => Ref.get(parent),
                    )
                },
            ),
        )

        expect(result).toEqual([99, 20, 30])
    })

    test("modifies array element at last index", async () => {
        const result = await Effect.runPromise(
            Effect.flatMap(
                SubscriptionRef.make(["a", "b", "c"]),
                parent => {
                    const subref = SubscriptionSubRef.makeFromPath(parent, [2])
                    return Effect.flatMap(
                        Ref.set(subref, "z"),
                        () => Ref.get(parent),
                    )
                },
            ),
        )

        expect(result).toEqual(["a", "b", "z"])
    })

    test("modifies nested array element", async () => {
        const result = await Effect.runPromise(
            Effect.flatMap(
                SubscriptionRef.make([[1, 2], [3, 4], [5, 6]]),
                parent => {
                    const subref = SubscriptionSubRef.makeFromPath(parent, [1, 0])
                    return Effect.flatMap(
                        Ref.set(subref, 99),
                        () => Ref.get(parent),
                    )
                },
            ),
        )

        expect(result).toEqual([[1, 2], [99, 4], [5, 6]])
    })

    test("uses modifyEffect to transform array element", async () => {
        const result = await Effect.runPromise(
            Effect.flatMap(
                SubscriptionRef.make([{ count: 1 }, { count: 2 }, { count: 3 }]),
                parent => {
                    const subref = SubscriptionSubRef.makeFromPath(parent, [1, "count"])
                    return Effect.flatMap(
                        Ref.update(subref, count => count + 100),
                        () => Effect.map(Ref.get(parent), parentValue => ({ result: 102, parentValue })),
                    )
                },
            ),
        )

        expect(result.result).toBe(102) // count + 100
        expect(result.parentValue).toEqual([{ count: 1 }, { count: 102 }, { count: 3 }]) // count + 100
    })

    test("uses modify to transform array element", async () => {
        const result = await Effect.runPromise(
            Effect.flatMap(
                SubscriptionRef.make([10, 20, 30]),
                parent => {
                    const subref = SubscriptionSubRef.makeFromPath(parent, [1])
                    return Effect.flatMap(
                        Ref.update(subref, x => x + 5),
                        () => Effect.map(Ref.get(parent), parentValue => ({ result: 25, parentValue })),
                    )
                },
            ),
        )

        expect(result.result).toBe(25) // 20 + 5
        expect(result.parentValue).toEqual([10, 25, 30]) // 20 + 5
    })

    test("makeFromChunkIndex modifies chunk element", async () => {
        const result = await Effect.runPromise(
            Effect.flatMap(
                SubscriptionRef.make(Chunk.make(100, 200, 300)),
                parent => {
                    const subref = SubscriptionSubRef.makeFromChunkIndex(parent, 1)
                    return Effect.flatMap(
                        Ref.set(subref, 999),
                        () => Ref.get(parent),
                    )
                },
            ),
        )

        expect(Chunk.toReadonlyArray(result)).toEqual([100, 999, 300])
    })

    test("makeFromGetSet with custom getter/setter for array element", async () => {
        const result = await Effect.runPromise(
            Effect.flatMap(
                SubscriptionRef.make([{ id: 1, value: "a" }, { id: 2, value: "b" }]),
                parent => {
                    const subref = SubscriptionSubRef.makeFromGetSet(parent, {
                        get: arr => arr[0].value,
                        set: (arr, newValue) => [
                            { ...arr[0], value: newValue },
                            ...arr.slice(1),
                        ],
                    })
                    return Effect.flatMap(
                        Ref.set(subref, "updated"),
                        () => Ref.get(parent),
                    )
                },
            ),
        )

        expect(result).toEqual([{ id: 1, value: "updated" }, { id: 2, value: "b" }])
    })

    test("does not mutate original array when modifying via subref", async () => {
        const original = [{ name: "alice" }, { name: "bob" }]
        const result = await Effect.runPromise(
            Effect.flatMap(
                SubscriptionRef.make(original),
                parent => {
                    const subref = SubscriptionSubRef.makeFromPath(parent, [0, "name"])
                    return Effect.flatMap(
                        Ref.set(subref, "alice-updated"),
                        () => Ref.get(parent),
                    )
                },
            ),
        )

        expect(original).toEqual([{ name: "alice" }, { name: "bob" }]) // original unchanged
        expect(result).toEqual([{ name: "alice-updated" }, { name: "bob" }]) // new value in ref
    })
})
