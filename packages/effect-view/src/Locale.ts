import { Context, Effect, Layer } from "effect"


export interface LocaleService {
    /** The first preferred BCP 47 language tag, when one is available. */
    readonly language: string
    /** The user's preferred BCP 47 language tags, in preference order. */
    readonly languages: readonly string[]
}

export class Locale extends Context.Service<Locale, LocaleService>()(
    "@effect-view/Locale/Locale",
) {}

export interface BrowserOptions {
    /** Used when the layer is constructed outside a browser, such as during SSR. */
    readonly fallback?: string
}

/**
 * Reads the browser's preferred languages without accessing `navigator` at
 * module evaluation time. This keeps the module safe to import during SSR.
 */
export const fromBrowser = (
    options: BrowserOptions = {},
): Effect.Effect<LocaleService> => Effect.sync(() => {
    const navigator = globalThis.navigator
    const languages = navigator?.languages.length > 0
        ? [...navigator.languages]
        : navigator?.language
            ? [navigator.language]
            : []

    return {
        language: languages[0] ?? options.fallback ?? "en",
        languages,
    }
})

/** Provides the user's browser language preferences as an Effect service. */
export const layerBrowser = (
    options: BrowserOptions = {},
): Layer.Layer<Locale> => Layer.effect(Locale, fromBrowser(options))
