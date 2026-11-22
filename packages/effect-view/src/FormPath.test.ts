import { describe, expect, it } from "vitest"
import * as FormPath from "./FormPath.js"


describe("FormPath", () => {
    it("is a prefix of itself and of its descendants only", () => {
        expect(FormPath.isPrefixOf([], ["a"])).toBe(true)
        expect(FormPath.isPrefixOf(["a"], ["a"])).toBe(true)
        expect(FormPath.isPrefixOf(["a"], ["a", 0, "b"])).toBe(true)
        expect(FormPath.isPrefixOf(["a", "b"], ["a"])).toBe(false)
        expect(FormPath.isPrefixOf(["a"], ["b", "a"])).toBe(false)
        expect(FormPath.isPrefixOf([0], ["0"])).toBe(false)
    })
})
