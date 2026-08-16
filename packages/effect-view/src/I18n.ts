import { Context, Effect, Layer } from "effect"
import * as Locale from "./Locale.js"


export interface MessageDefinition<Params = never> {
    readonly _tag: "MessageDefinition"
    readonly _params?: Params
}

export type Contract = Readonly<Record<string, MessageDefinition<unknown>>>

export type MessageParams<Definition> = Definition extends MessageDefinition<infer Params>
    ? Params
    : never

export type MessageKey<Messages extends Contract> = keyof Messages & string

export type Translation<Definition> = [MessageParams<Definition>] extends [never]
    ? string
    : (params: MessageParams<Definition>) => string

export type Catalog<Messages extends Contract> = {
    readonly [Key in keyof Messages]: Translation<Messages[Key]>
}

export const text = (): MessageDefinition => ({
    _tag: "MessageDefinition",
})

export const message = <Params>(): MessageDefinition<Params> => ({
    _tag: "MessageDefinition",
})

export const contract = <const Messages extends Contract>(
    messages: Messages,
): Messages => messages

export const catalog = <Messages extends Contract>(
    _contract: Messages,
    translations: Catalog<Messages>,
): Catalog<Messages> => translations

export class CatalogLoadError extends Error {
    readonly _tag = "CatalogLoadError"

    constructor(
        readonly locale: string,
        readonly cause: unknown,
    ) {
        super(`Unable to load the ${locale} translation catalog`)
    }
}

export class MissingMessageError extends Error {
    readonly _tag = "MissingMessageError"

    constructor(
        readonly locale: string,
        readonly key: string,
    ) {
        super(`Missing translation for ${key} in locale ${locale}`)
    }
}

export interface I18nService<Messages extends Contract, Language extends string> {
    readonly locale: Language
    readonly translate: <Key extends MessageKey<Messages>>(
        ...args: TranslateArguments<Messages, Key>
    ) => Effect.Effect<string, MissingMessageError>
}

export type TranslateArguments<
    Messages extends Contract,
    Key extends MessageKey<Messages>,
> = [MessageParams<Messages[Key]>] extends [never]
    ? [key: Key]
    : [key: Key, params: MessageParams<Messages[Key]>]

export type Loader<Messages extends Contract> = () => Effect.Effect<Catalog<Messages>, unknown>

export type LoaderMap<Messages extends Contract> = Readonly<Record<string, Loader<Messages>>>

export interface I18n<Messages extends Contract, Language extends string> {
    readonly service: Context.Service<
        I18nService<Messages, Language>,
        I18nService<Messages, Language>
    >
    readonly layer: Layer.Layer<
        I18nService<Messages, Language>,
        CatalogLoadError,
        Locale.Locale
    >
}

export interface MakeOptions<Messages extends Contract, Loaders extends LoaderMap<Messages>> {
    readonly contract: Messages
    readonly loaders: Loaders
    readonly fallback: keyof Loaders & string
    /** Optional stable identifier when an application creates multiple translators. */
    readonly key?: string
}

let nextServiceId = 0

const baseLanguage = (language: string): string => language.toLowerCase().split("-", 1)[0] ?? ""

const resolveLanguage = <Loaders extends Readonly<Record<string, unknown>>>(
    preferred: readonly string[],
    loaders: Loaders,
    fallback: keyof Loaders & string,
): keyof Loaders & string => {
    const available = Object.keys(loaders) as Array<keyof Loaders & string>

    for (const language of preferred) {
        const exact = available.find(candidate => candidate.toLowerCase() === language.toLowerCase())
        if (exact !== undefined) return exact

        const base = baseLanguage(language)
        const languageOnly = available.find(candidate => baseLanguage(candidate) === base)
        if (languageOnly !== undefined) return languageOnly
    }

    return fallback
}

export const make = <
    const Messages extends Contract,
    const Loaders extends LoaderMap<Messages>,
>(
    options: MakeOptions<Messages, Loaders>,
): I18n<Messages, keyof Loaders & string> => {
    type Language = keyof Loaders & string

    const service = Context.Service<I18nService<Messages, Language>>(
        options.key ?? `@effect-view/I18n/I18n/${nextServiceId++}`,
    )

    const layer = Layer.effect(
        service,
        Effect.gen(function*() {
            const locale = yield* Locale.Locale
            const language = resolveLanguage(locale.languages, options.loaders, options.fallback) as Language
            const load = options.loaders[language]

            const translations = yield* load().pipe(
                Effect.mapError(error => new CatalogLoadError(language, error)),
            )

            return {
                locale: language,
                translate: <Key extends MessageKey<Messages>>(
                    ...args: TranslateArguments<Messages, Key>
                ): Effect.Effect<string, MissingMessageError> => {
                    const key = args[0]
                    const translation = translations[key]

                    if (translation === undefined) {
                        return Effect.fail(new MissingMessageError(language, key))
                    }

                    if (typeof translation === "function") {
                        const format = translation as (params: MessageParams<Messages[Key]>) => string
                        return Effect.sync(() => format(args[1] as MessageParams<Messages[Key]>))
                    }

                    return Effect.succeed(translation as string)
                },
            }
        }),
    )

    return { service, layer }
}
