import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import * as Locale from "./Locale.js"


const readLocale = Effect.gen(function*() {
    const locale = yield* Locale.Locale
    return locale
})

describe("Locale", () => {
    it("reads the ordered browser language preferences", async () => {
        Object.defineProperty(globalThis.navigator, "languages", {
            configurable: true,
            value: ["fr-CA", "fr", "en-US"],
        })
        Object.defineProperty(globalThis.navigator, "language", {
            configurable: true,
            value: "fr-CA",
        })

        const locale = await Effect.runPromise(
            readLocale.pipe(Effect.provide(Locale.layerBrowser())),
        )

        expect(locale).toEqual({
            language: "fr-CA",
            languages: ["fr-CA", "fr", "en-US"],
        })
    })

    it("uses the singular language when the preference list is empty", async () => {
        Object.defineProperty(globalThis.navigator, "languages", {
            configurable: true,
            value: [],
        })
        Object.defineProperty(globalThis.navigator, "language", {
            configurable: true,
            value: "de-DE",
        })

        const locale = await Effect.runPromise(
            readLocale.pipe(Effect.provide(Locale.layerBrowser())),
        )

        expect(locale).toEqual({
            language: "de-DE",
            languages: ["de-DE"],
        })
    })

    it("supports a fallback when browser APIs are unavailable", async () => {
        const originalNavigator = globalThis.navigator

        Object.defineProperty(globalThis, "navigator", {
            configurable: true,
            value: undefined,
        })

        const locale = await Effect.runPromise(
            readLocale.pipe(Effect.provide(Locale.layerBrowser({ fallback: "en-GB" }))),
        )

        Object.defineProperty(globalThis, "navigator", {
            configurable: true,
            value: originalNavigator,
        })

        expect(locale).toEqual({
            language: "en-GB",
            languages: [],
        })
    })
})
