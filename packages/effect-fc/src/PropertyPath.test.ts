import { describe, expect, test } from "bun:test"
import { Option } from "effect"
import * as PropertyPath from "./PropertyPath.js"


describe("immutableSet with arrays", () => {
    test("sets a top-level array element", () => {
        const arr = [1, 2, 3]
        const result = PropertyPath.immutableSet(arr, [1], 99)
        expect(result).toEqual(Option.some([1, 99, 3]))
    })

    test("does not mutate the original array", () => {
        const arr = [1, 2, 3]
        PropertyPath.immutableSet(arr, [0], 42)
        expect(arr).toEqual([1, 2, 3])
    })

    test("sets the first element of an array", () => {
        const arr = ["a", "b", "c"]
        const result = PropertyPath.immutableSet(arr, [0], "z")
        expect(result).toEqual(Option.some(["z", "b", "c"]))
    })

    test("sets the last element of an array", () => {
        const arr = [10, 20, 30]
        const result = PropertyPath.immutableSet(arr, [2], 99)
        expect(result).toEqual(Option.some([10, 20, 99]))
    })

    test("sets a nested array element inside an object", () => {
        const obj = { tags: ["foo", "bar", "baz"] }
        const result = PropertyPath.immutableSet(obj, ["tags", 1], "qux")
        expect(result).toEqual(Option.some({ tags: ["foo", "qux", "baz"] }))
    })

    test("sets a deeply nested value inside an array of objects", () => {
        const obj = { items: [{ name: "alice" }, { name: "bob" }] }
        const result = PropertyPath.immutableSet(obj, ["items", 0, "name"], "charlie")
        expect(result).toEqual(Option.some({ items: [{ name: "charlie" }, { name: "bob" }] }))
    })

    test("sets a value in a nested array", () => {
        const matrix = [[1, 2], [3, 4]]
        const result = PropertyPath.immutableSet(matrix, [1, 0], 99)
        expect(result).toEqual(Option.some([[1, 2], [99, 4]]))
    })

    test("returns Option.none() for an out-of-bounds index", () => {
        const arr = [1, 2, 3]
        const result = PropertyPath.immutableSet(arr, [5], 99)
        expect(result).toEqual(Option.none())
    })

    test("returns Option.none() for a non-numeric key on an array", () => {
        const arr = [1, 2, 3]
        // @ts-expect-error intentionally wrong key type
        const result = PropertyPath.immutableSet(arr, ["length"], 0)
        expect(result).toEqual(Option.none())
    })

    test("empty path returns Option.some of the value itself", () => {
        const arr = [1, 2, 3]
        const result = PropertyPath.immutableSet(arr, [], [9, 9, 9] as any)
        expect(result).toEqual(Option.some([9, 9, 9]))
    })
})
