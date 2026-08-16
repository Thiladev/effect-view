import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import * as I18n from "./I18n.js"
import * as Locale from "./Locale.js"


const Messages = I18n.contract({
    title: I18n.text(),
    welcome: I18n.message<{ readonly name: string }>(),
})

const English = I18n.catalog(Messages, {
    title: "Welcome",
    welcome: ({ name }) => `Hello, ${name}!`,
})

const French = I18n.catalog(Messages, {
    title: "Bienvenue",
    welcome: ({ name }) => `Bonjour, ${name}!`,
})

const AppI18n = I18n.make({
    contract: Messages,
    fallback: "en",
    loaders: {
        en: () => Effect.succeed(English),
        fr: () => Effect.succeed(French),
    },
})

const _assertTypeSafety = (service: I18n.I18nService<typeof Messages, "en" | "fr">) => Effect.gen(function*() {
    yield* service.translate("title")
    yield* service.translate("welcome", { name: "Ada" })

    // @ts-expect-error Unknown message keys are rejected.
    yield* service.translate("missing")
    // @ts-expect-error Parameterized messages require their parameters.
    yield* service.translate("welcome")
    // @ts-expect-error Parameters must match the message contract.
    yield* service.translate("welcome", { userId: 1 })
})

const run = <A, E>(
    effect: Effect.Effect<A, E, I18n.I18nService<typeof Messages, "en" | "fr">>,
    language: string,
) => effect.pipe(
    Effect.provide(
        AppI18n.layer.pipe(
            Layer.provide(Layer.succeed(Locale.Locale, {
                language,
                languages: [language],
            })),
        ),
    ),
    Effect.runPromise,
)

describe("I18n", () => {
    it("selects the exact preferred locale", async () => {
        const result = await run(Effect.gen(function*() {
            const i18n = yield* AppI18n.service
            return [i18n.locale, yield* i18n.translate("title"), yield* i18n.translate("welcome", { name: "Ada" })]
        }), "fr")

        expect(result).toEqual(["fr", "Bienvenue", "Bonjour, Ada!"])
    })

    it("matches a base language before using the fallback", async () => {
        const result = await run(Effect.gen(function*() {
            const i18n = yield* AppI18n.service
            return [i18n.locale, yield* i18n.translate("title")]
        }), "fr-CA")

        expect(result).toEqual(["fr", "Bienvenue"])
    })

    it("uses the configured fallback when no locale matches", async () => {
        const result = await run(Effect.gen(function*() {
            const i18n = yield* AppI18n.service
            return [i18n.locale, yield* i18n.translate("title")]
        }), "de")

        expect(result).toEqual(["en", "Welcome"])
    })

    it("supports asynchronous code-split loaders", async () => {
        const i18n = I18n.make({
            contract: Messages,
            fallback: "en",
            loaders: {
                en: () => Effect.promise(async () => English),
                fr: () => Effect.promise(async () => French),
            },
        })

        const result = await Effect.gen(function*() {
            const service = yield* i18n.service
            return yield* service.translate("welcome", { name: "Grace" })
        }).pipe(
            Effect.provide(
                i18n.layer.pipe(
                    Layer.provide(Layer.succeed(Locale.Locale, {
                        language: "en",
                        languages: ["en"],
                    })),
                ),
            ),
            Effect.runPromise,
        )

        expect(result).toBe("Hello, Grace!")
    })
})
