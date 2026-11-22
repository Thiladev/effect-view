import type { StandardSchemaV1 } from "@standard-schema/spec"
import { Array, Cause, Chunk, type Duration, Effect, Equal, Function, identity, Option, Pipeable, Predicate, type Scope, Stream, SubscriptionRef } from "effect"
import * as React from "react"
import * as Component from "./Component.js"
import type * as FormBuffers from "./FormBuffers.js"
import * as Lens from "./Lens.js"
import * as View from "./View.js"


export const FormTypeId: unique symbol = Symbol.for("@effect-view/Form/Form")
export type FormTypeId = typeof FormTypeId

export interface Form<out P extends readonly PropertyKey[], out A, in out I = A, out ER = never, out EW = never>
extends Pipeable.Pipeable {
    readonly [FormTypeId]: FormTypeId

    readonly buffers: FormBuffers.FormBuffers
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
        readonly buffers: FormBuffers.FormBuffers,
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
        form.buffers,
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
        form.buffers,
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
        form.buffers,
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
        form.buffers,
        path,
        View.mapOptionEffect(form.value, value => Effect.fromOption(Chunk.get(value, index))),
        Lens.focusChunkAt(form.encodedValue, index),
        View.map(form.issues, issues => filterIssuesByPath(issues, path)),
        form.isValidating,
        form.canCommit,
        form.isCommitting,
    )
})


export declare namespace useStatus {
    export interface Options {
        /**
         * The debounce interval applied to changes in the returned status.
         *
         * Defaults to 250 milliseconds.
         */
        readonly debounce?: Duration.Input
    }

    export interface Success {
        readonly isValidating: boolean
        readonly isCommitting: boolean
        readonly canCommit: boolean
    }
}

/**
 * Subscribes to form status flags for presentation.
 *
 * Status changes are debounced to avoid transient UI feedback. The underlying
 * form state is not changed.
 */
export const useStatus = Effect.fnUntraced(function* <P extends readonly PropertyKey[], A, I, ER, EW>(
    form: Form<P, A, I, ER, EW>,
    options?: useStatus.Options,
): Effect.fn.Return<useStatus.Success, ER, Scope.Scope> {
    const views = React.useMemo(() => {
        const debounce = options?.debounce ?? "250 millis"

        return [
            View.mapStream(form.isValidating, Stream.debounce(debounce)),
            View.mapStream(form.isCommitting, Stream.debounce(debounce)),
            View.mapStream(form.canCommit, Stream.debounce(debounce)),
        ] as const
    }, [form, options?.debounce])

    const [isValidating, isCommitting, canCommit] = yield* View.useAll(views)
    return { isValidating, isCommitting, canCommit }
})

export namespace useLiveInput {
    export interface Options {
        readonly debounce?: Duration.Input
    }

    export interface Success<T> {
        readonly value: T
        readonly setValue: React.Dispatch<React.SetStateAction<T>>

        /**
         * Whether the input has been flushed at least once, by `flush` or by `MutationForm.submit`.
         *
         * It is local to the input: it starts `false`, and does not reach the form.
         */
        readonly flushed: boolean
        /** Writes the value to the form right away, without waiting for the debounce. */
        readonly flush: () => Promise<void>
    }
}

export const useLiveInput = Effect.fnUntraced(function* <P extends readonly PropertyKey[], A, I, ER, EW>(
    form: Form<P, A, I, ER, EW>,
    options?: useLiveInput.Options,
): Effect.fn.Return<useLiveInput.Success<I>, ER, Scope.Scope> {
    const [internalValueLens, flushedLens, flushEffect] = yield* Component.useOnChange(() => Effect.gen(function*() {
        const internalValueLens = yield* Lens.get(form.encodedValue).pipe(
            Effect.flatMap(SubscriptionRef.make),
            Effect.map(Lens.fromSubscriptionRef),
        )
        const flushedLens = Lens.fromSubscriptionRef(yield* SubscriptionRef.make(false))

        const write = makeWrite(form, internalValueLens)
        const flush = Effect.andThen(write, Lens.set(flushedLens, true))

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
                () => write,
            ),
        ], { concurrency: "unbounded", discard: true }))

        yield* form.buffers.register(form.path, flush)

        return [internalValueLens, flushedLens, flush] as const
    }), [form, options?.debounce])

    const [value, setValue] = yield* Lens.useState(internalValueLens)
    const [flushed] = yield* View.useAll([flushedLens])
    const flush = yield* Component.useCallbackPromise(() => flushEffect, [flushEffect])

    return { value, setValue, flush, flushed }
})

export namespace useOptionalLiveInput {
    export interface Options<T> extends useLiveInput.Options {
        readonly defaultValue: T
    }

    export interface Success<T> extends useLiveInput.Success<T> {
        readonly enabled: boolean
        readonly setEnabled: React.Dispatch<React.SetStateAction<boolean>>
    }
}

export const useOptionalLiveInput = Effect.fnUntraced(function* <P extends readonly PropertyKey[], A, I, ER, EW>(
    field: Form<P, A, Option.Option<I>, ER, EW>,
    options: useOptionalLiveInput.Options<I>,
): Effect.fn.Return<useOptionalLiveInput.Success<I>, ER, Scope.Scope> {
    const [enabledLens, internalValueLens, flushedLens, flushEffect] = yield* Component.useOnChange(() => Effect.gen(function*() {
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
        const flushedLens = Lens.fromSubscriptionRef(yield* SubscriptionRef.make(false))

        const write = makeOptionalWrite(field, enabledLens, internalValueLens)
        const flush = Effect.andThen(write, Lens.set(flushedLens, true))

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
                () => write,
            ),
        ], { concurrency: "unbounded", discard: true }))

        yield* field.buffers.register(field.path, flush)

        return [enabledLens, internalValueLens, flushedLens, flush] as const
    }), [field, options.debounce])

    const [enabled, setEnabled] = yield* Lens.useState(enabledLens)
    const [value, setValue] = yield* Lens.useState(internalValueLens)
    const [flushed] = yield* View.useAll([flushedLens])
    const flush = yield* Component.useCallbackPromise(() => flushEffect, [flushEffect])

    return { enabled, setEnabled, value, setValue, flush, flushed }
})

export namespace useBufferedInput {
    export interface Success<T> {
        readonly value: T
        readonly setValue: React.Dispatch<React.SetStateAction<T>>

        /**
         * Whether the input has been flushed at least once, by `flush` or by `MutationForm.submit`.
         *
         * It is local to the input: it starts `false`, and does not reach the form.
         */
        readonly flushed: boolean
        /** Writes the value to the form. */
        readonly flush: () => Promise<void>
    }
}

/**
 * Binds an input to a form, holding the value back from it: the value is written to the form, which validates it, when
 * `flush` is called, so the form is not validated while the user is typing. A value that is not written yet is written
 * when the form is submitted.
 */
export const useBufferedInput = Effect.fnUntraced(function* <P extends readonly PropertyKey[], A, I, ER, EW>(
    form: Form<P, A, I, ER, EW>,
): Effect.fn.Return<useBufferedInput.Success<I>, ER, Scope.Scope> {
    const [internalValueLens, flushedLens, flushEffect] = yield* Component.useOnChange(() => Effect.gen(function*() {
        const internalValueLens = yield* Lens.get(form.encodedValue).pipe(
            Effect.flatMap(SubscriptionRef.make),
            Effect.map(Lens.fromSubscriptionRef),
        )
        const flushedLens = Lens.fromSubscriptionRef(yield* SubscriptionRef.make(false))

        const write = makeWrite(form, internalValueLens)
        const flush = Effect.andThen(write, Lens.set(flushedLens, true))

        yield* Effect.forkScoped(Stream.runForEach(
            Stream.drop(Lens.changes(form.encodedValue), 1),
            upstreamEncodedValue => Effect.when(
                Lens.set(internalValueLens, upstreamEncodedValue),
                Effect.map(Lens.get(internalValueLens), internalValue => !Equal.equals(upstreamEncodedValue, internalValue)),
            ),
        ))

        yield* form.buffers.register(form.path, flush)

        return [internalValueLens, flushedLens, flush] as const
    }), [form])

    const [value, setValue] = yield* Lens.useState(internalValueLens)
    const [flushed] = yield* View.useAll([flushedLens])
    const flush = yield* Component.useCallbackPromise(() => flushEffect, [flushEffect])

    return { value, setValue, flush, flushed }
})

export namespace useOptionalBufferedInput {
    export interface Options<T> {
        readonly defaultValue: T
    }

    export interface Success<T> extends useBufferedInput.Success<T> {
        readonly enabled: boolean
        readonly setEnabled: React.Dispatch<React.SetStateAction<boolean>>
    }
}

/**
 * Binds a togglable optional input to a form, holding the value back from it: the value is written to the form, which
 * validates it, when `flush` is called. Toggling `enabled` writes right away. A value that is not written yet is
 * written when the form is submitted.
 */
export const useOptionalBufferedInput = Effect.fnUntraced(function* <P extends readonly PropertyKey[], A, I, ER, EW>(
    field: Form<P, A, Option.Option<I>, ER, EW>,
    options: useOptionalBufferedInput.Options<I>,
): Effect.fn.Return<useOptionalBufferedInput.Success<I>, ER, Scope.Scope> {
    const [enabledLens, internalValueLens, flushedLens, flushEffect] = yield* Component.useOnChange(() => Effect.gen(function*() {
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
        const flushedLens = Lens.fromSubscriptionRef(yield* SubscriptionRef.make(false))

        const write = makeOptionalWrite(field, enabledLens, internalValueLens)
        const flush = Effect.andThen(write, Lens.set(flushedLens, true))

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
                    Stream.drop(1),
                    Stream.changesWith(Equal.asEquivalence()),
                ),
                () => write,
            ),
        ], { concurrency: "unbounded", discard: true }))

        yield* field.buffers.register(field.path, flush)

        return [enabledLens, internalValueLens, flushedLens, flush] as const
    }), [field])

    const [enabled, setEnabled] = yield* Lens.useState(enabledLens)
    const [value, setValue] = yield* Lens.useState(internalValueLens)
    const [flushed] = yield* View.useAll([flushedLens])
    const flush = yield* Component.useCallbackPromise(() => flushEffect, [flushEffect])

    return { enabled, setEnabled, value, setValue, flush, flushed }
})

/** The effect that writes the value held by an input to its form, if it differs from the one the form already has. */
const makeWrite = <P extends readonly PropertyKey[], A, I, ER, EW>(
    form: Form<P, A, I, ER, EW>,
    internalValueLens: Lens.Lens<I, never, never>,
): Effect.Effect<void> => Effect.gen(function*() {
    const internalValue = yield* Lens.get(internalValueLens)
    if (!Equal.equals(internalValue, yield* Lens.get(form.encodedValue)))
        yield* Lens.set(form.encodedValue, internalValue)
}).pipe(
    // The validation of a write is interrupted when the form is submitted, which is not an error.
    Effect.catchCause(cause => Cause.hasInterruptsOnly(cause)
        ? Effect.void
        : Effect.logError("Form input: could not write its value to the form", cause)
    ),
)

/** `makeWrite` for an optional input, where the form holds `None` while the input is disabled. */
const makeOptionalWrite = <P extends readonly PropertyKey[], A, I, ER, EW>(
    field: Form<P, A, Option.Option<I>, ER, EW>,
    enabledLens: Lens.Lens<boolean, never, never>,
    internalValueLens: Lens.Lens<I, never, never>,
): Effect.Effect<void> => Effect.gen(function*() {
    const enabled = yield* Lens.get(enabledLens)
    const internalValue = yield* Lens.get(internalValueLens)
    const encodedValue = enabled ? Option.some(internalValue) : Option.none<I>()
    if (!Equal.equals(encodedValue, yield* Lens.get(field.encodedValue)))
        yield* Lens.set(field.encodedValue, encodedValue)
}).pipe(
    // The validation of a write is interrupted when the form is submitted, which is not an error.
    Effect.catchCause(cause => Cause.hasInterruptsOnly(cause)
        ? Effect.void
        : Effect.logError("Form input: could not write its value to the form", cause)
    ),
)
