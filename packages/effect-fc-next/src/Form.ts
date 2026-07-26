import type { StandardSchemaV1 } from "@standard-schema/spec"
import { Array, type Cause, Chunk, type Duration, Effect, Equal, Function, identity, Option, Pipeable, Predicate, type Scope, Stream, SubscriptionRef } from "effect"
import type * as React from "react"
import * as Component from "./Component.js"
import * as Lens from "./Lens.js"
import * as View from "./View.js"


export const FormTypeId: unique symbol = Symbol.for("@effect-fc/Form/Form")
export type FormTypeId = typeof FormTypeId

export interface Form<out P extends readonly PropertyKey[], out A, in out I = A, out ER = never, out EW = never>
extends Pipeable.Pipeable {
    readonly [FormTypeId]: FormTypeId

    readonly path: P
    readonly value: View.View<Option.Option<A>, ER, never>
    readonly encodedValue: Lens.Lens<I, ER, EW, never, never>
    readonly issues: View.View<readonly StandardSchemaV1.Issue[], never, never>
    readonly isValidating: View.View<boolean, ER, never>
    readonly canCommit: View.View<boolean, never, never>
    readonly isCommitting: View.View<boolean, never, never>
}

export class FormImpl<out P extends readonly PropertyKey[], out A, in out I = A, out ER = never, out EW = never>
extends Pipeable.Class implements Form<P, A, I, ER, EW> {
    readonly [FormTypeId]: FormTypeId = FormTypeId

    constructor(
        readonly path: P,
        readonly value: View.View<Option.Option<A>, ER, never>,
        readonly encodedValue: Lens.Lens<I, ER, EW, never, never>,
        readonly issues: View.View<readonly StandardSchemaV1.Issue[], never, never>,
        readonly isValidating: View.View<boolean, never, never>,
        readonly canCommit: View.View<boolean, never, never>,
        readonly isCommitting: View.View<boolean, never, never>,
    ) {
        super()
    }
}

export const isForm = (u: unknown): u is Form<readonly PropertyKey[], unknown, unknown, unknown, unknown> => Predicate.hasProperty(u, FormTypeId)


const filterIssuesByPath = (
    issues: readonly StandardSchemaV1.Issue[],
    path: readonly PropertyKey[],
): readonly StandardSchemaV1.Issue[] => Array.filter(issues, issue => {
    const issuePath = issue.path
    if (!issuePath) return false
    return issuePath.length >= path.length && Array.every(path, (p, i) => p === issuePath[i])
})

export const focusObjectOn: {
    <P extends readonly PropertyKey[], A extends object, I extends object, ER, EW, K extends keyof A & keyof I>(
        self: Form<P, A, I, ER, EW>,
        key: K,
    ): Form<readonly [...P, K], A[K], I[K], ER, EW>
    <P extends readonly PropertyKey[], A extends object, I extends object, ER, EW, K extends keyof A & keyof I>(
        key: K,
    ): (self: Form<P, A, I, ER, EW>) => Form<readonly [...P, K], A[K], I[K], ER, EW>
} = Function.dual(2, <P extends readonly PropertyKey[], A extends object, I extends object, ER, EW, K extends keyof A & keyof I>(
    self: Form<P, A, I, ER, EW>,
    key: K,
): Form<readonly [...P, K], A[K], I[K], ER, EW> => {
    const form = self as FormImpl<P, A, I, ER, EW>
    const path = [...form.path, key] as const

    return new FormImpl(
        path,
        View.mapOption(form.value, a => a[key]),
        Lens.focusObjectOn(form.encodedValue, key),
        View.map(form.issues, issues => filterIssuesByPath(issues, path)),
        form.isValidating,
        form.canCommit,
        form.isCommitting,
    )
})

export const focusArrayAt: {
    <P extends readonly PropertyKey[], A extends readonly any[], I extends readonly any[], ER, EW>(
        self: Form<P, A, I, ER, EW>,
        index: number,
    ): Form<readonly [...P, number], A[number], I[number], ER | Cause.NoSuchElementError, EW | Cause.NoSuchElementError>
    <P extends readonly PropertyKey[], A extends readonly any[], I extends readonly any[], ER, EW>(
        index: number,
    ): (self: Form<P, A, I, ER, EW>) => Form<readonly [...P, number], A[number], I[number], ER | Cause.NoSuchElementError, EW | Cause.NoSuchElementError>
} = Function.dual(2, <P extends readonly PropertyKey[], A extends readonly any[], I extends readonly any[], ER, EW>(
    self: Form<P, A, I, ER, EW>,
    index: number,
): Form<readonly [...P, number], A[number], I[number], ER | Cause.NoSuchElementError, EW | Cause.NoSuchElementError> => {
    const form = self as FormImpl<P, A, I, ER, EW>
    const path = [...form.path, index] as const

    return new FormImpl(
        path,
        View.mapOptionEffect(form.value, value => Effect.fromOption(Array.get(value, index))),
        Lens.focusArrayAt(form.encodedValue, index),
        View.map(form.issues, issues => filterIssuesByPath(issues, path)),
        form.isValidating,
        form.canCommit,
        form.isCommitting,
    )
})

export const focusTupleAt: {
    <P extends readonly PropertyKey[], A extends readonly [any, ...any[]], I extends readonly [any, ...any[]], ER, EW, K extends number>(
        self: Form<P, A, I, ER, EW>,
        index: K,
    ): Form<readonly [...P, K], A[K], I[K], ER, EW>
    <P extends readonly PropertyKey[], A extends readonly [any, ...any[]], I extends readonly [any, ...any[]], ER, EW, K extends number>(
        index: K,
    ): (self: Form<P, A, I, ER, EW>) => Form<readonly [...P, K], A[K], I[K], ER, EW>
} = Function.dual(2, <P extends readonly PropertyKey[], A extends readonly [any, ...any[]], I extends readonly [any, ...any[]], ER, EW, K extends number>(
    self: Form<P, A, I, ER, EW>,
    index: K,
): Form<readonly [...P, K], A[K], I[K], ER, EW> => {
    const form = self as FormImpl<P, A, I, ER, EW>
    const path = [...form.path, index] as const

    return new FormImpl(
        path,
        View.mapOption(form.value, Array.getUnsafe(index)),
        Lens.focusTupleAt(form.encodedValue, index),
        View.map(form.issues, issues => filterIssuesByPath(issues, path)),
        form.isValidating,
        form.canCommit,
        form.isCommitting,
    )
})

export const focusChunkAt: {
    <P extends readonly PropertyKey[], A, I, ER, EW>(
        self: Form<P, Chunk.Chunk<A>, Chunk.Chunk<I>, ER, EW>,
        index: number,
    ): Form<readonly [...P, number], A, I, ER | Cause.NoSuchElementError, EW>
    <P extends readonly PropertyKey[], A, I, ER, EW>(
        index: number,
    ): (self: Form<P, Chunk.Chunk<A>, Chunk.Chunk<I>, ER, EW>) => Form<readonly [...P, number], A, I, ER | Cause.NoSuchElementError, EW>
} = Function.dual(2, <P extends readonly PropertyKey[], A, I, ER, EW>(
    self: Form<P, Chunk.Chunk<A>, Chunk.Chunk<I>, ER, EW>,
    index: number,
): Form<readonly [...P, number], A, I, ER | Cause.NoSuchElementError, EW> => {
    const form = self as FormImpl<P, Chunk.Chunk<A>, Chunk.Chunk<I>, ER, EW>
    const path = [...form.path, index] as const

    return new FormImpl(
        path,
        View.mapOptionEffect(form.value, value => Effect.fromOption(Chunk.get(value, index))),
        Lens.focusChunkAt(form.encodedValue, index),
        View.map(form.issues, issues => filterIssuesByPath(issues, path)),
        form.isValidating,
        form.canCommit,
        form.isCommitting,
    )
})


export namespace useInput {
    export interface Options {
        readonly debounce?: Duration.Input
    }

    export interface Success<T> {
        readonly value: T
        readonly setValue: React.Dispatch<React.SetStateAction<T>>
    }
}

export const useInput = Effect.fnUntraced(function* <P extends readonly PropertyKey[], A, I, ER, EW>(
    form: Form<P, A, I, ER, EW>,
    options?: useInput.Options,
): Effect.fn.Return<useInput.Success<I>, ER, Scope.Scope> {
    const internalValueLens = yield* Component.useOnChange(() => Effect.gen(function*() {
        const internalValueLens = yield* Lens.get(form.encodedValue).pipe(
            Effect.flatMap(SubscriptionRef.make),
            Effect.map(Lens.fromSubscriptionRef),
        )

        yield* Effect.forkScoped(Effect.all([
            Stream.runForEach(
                Stream.drop(Lens.changes(form.encodedValue), 1),
                upstreamEncodedValue => Effect.when(
                    Lens.set(internalValueLens, upstreamEncodedValue),
                    Effect.map(Lens.get(internalValueLens), internalValue => !Equal.equals(upstreamEncodedValue, internalValue)),
                ),
            ),

            Stream.runForEach(
                Lens.changes(internalValueLens).pipe(
                    Stream.drop(1),
                    Stream.changesWith(Equal.asEquivalence()),
                    options?.debounce ? Stream.debounce(options.debounce) : identity,
                ),
                internalValue => Lens.set(form.encodedValue, internalValue),
            ),
        ], { concurrency: "unbounded", discard: true }))

        return internalValueLens
    }), [form, options?.debounce])

    const [value, setValue] = yield* Lens.useState(internalValueLens)
    return { value, setValue }
})

export namespace useOptionalInput {
    export interface Options<T> extends useInput.Options {
        readonly defaultValue: T
    }

    export interface Success<T> extends useInput.Success<T> {
        readonly enabled: boolean
        readonly setEnabled: React.Dispatch<React.SetStateAction<boolean>>
    }
}

export const useOptionalInput = Effect.fnUntraced(function* <P extends readonly PropertyKey[], A, I, ER, EW>(
    field: Form<P, A, Option.Option<I>, ER, EW>,
    options: useOptionalInput.Options<I>,
): Effect.fn.Return<useOptionalInput.Success<I>, ER, Scope.Scope> {
    const [enabledLens, internalValueLens] = yield* Component.useOnChange(() => Effect.gen(function*() {
        const [enabledLens, internalValueLens] = yield* Effect.flatMap(
            Lens.get(field.encodedValue),
            Option.match({
                onSome: v => Effect.all([
                    Effect.map(SubscriptionRef.make(true), Lens.fromSubscriptionRef),
                    Effect.map(SubscriptionRef.make(v), Lens.fromSubscriptionRef),
                ]),
                onNone: () => Effect.all([
                    Effect.map(SubscriptionRef.make(false), Lens.fromSubscriptionRef),
                    Effect.map(SubscriptionRef.make(options.defaultValue), Lens.fromSubscriptionRef),
                ]),
            }),
        )

        yield* Effect.forkScoped(Effect.all([
            Stream.runForEach(
                Stream.drop(Lens.changes(field.encodedValue), 1),

                upstreamEncodedValue => Effect.when(
                    Option.match(upstreamEncodedValue, {
                        onSome: v => Effect.andThen(
                            Lens.set(enabledLens, true),
                            Lens.set(internalValueLens, v),
                        ),
                        onNone: () => Effect.andThen(
                            Lens.set(enabledLens, false),
                            Lens.set(internalValueLens, options.defaultValue),
                        ),
                    }),

                    Effect.map(
                        Effect.all([Lens.get(enabledLens), Lens.get(internalValueLens)]),
                        ([enabled, internalValue]) => !Equal.equals(upstreamEncodedValue, enabled ? Option.some(internalValue) : Option.none()),
                    ),
                ),
            ),

            Stream.runForEach(
                Lens.changes(enabledLens).pipe(
                    Stream.zipLatest(internalValueLens.changes),
                    Stream.drop(1),
                    Stream.changesWith(Equal.asEquivalence()),
                    options?.debounce ? Stream.debounce(options.debounce) : identity,
                ),
                ([enabled, internalValue]) => Lens.set(field.encodedValue, enabled ? Option.some(internalValue) : Option.none()),
            ),
        ], { concurrency: "unbounded" }))

        return [enabledLens, internalValueLens] as const
    }), [field, options.debounce])

    const [enabled, setEnabled] = yield* Lens.useState(enabledLens)
    const [value, setValue] = yield* Lens.useState(internalValueLens)
    return { enabled, setEnabled, value, setValue }
})
