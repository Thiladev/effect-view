import { Array, Cause, Chunk, type Context, type Duration, Effect, Equal, Exit, Fiber, Function, identity, Option, ParseResult, Pipeable, Predicate, Schema, type Scope, Stream } from "effect"
import type * as React from "react"
import * as Component from "./Component.js"
import * as Lens from "./Lens.js"
import * as Mutation from "./Mutation.js"
import * as Result from "./Result.js"
import * as Subscribable from "./Subscribable.js"
import * as SubscriptionRef from "./SubscriptionRef.js"


export const FormTypeId: unique symbol = Symbol.for("@effect-fc/Form/Form")
export type FormTypeId = typeof FormTypeId

export interface Form<out P extends readonly PropertyKey[], in out A, in out I = A, in out ER = never, in out EW = never>
extends Pipeable.Pipeable {
    readonly [FormTypeId]: FormTypeId

    readonly path: P
    readonly value: Subscribable.Subscribable<Option.Option<A>, ER, never>
    readonly encodedValue: Lens.Lens<I, ER, EW, never, never>
    readonly issues: Subscribable.Subscribable<readonly ParseResult.ArrayFormatterIssue[], never, never>
    readonly isValidating: Subscribable.Subscribable<boolean, ER, never>
    readonly canSubmit: Subscribable.Subscribable<boolean, never, never>
    readonly isSubmitting: Subscribable.Subscribable<boolean, never, never>
}

export class FormImpl<out P extends readonly PropertyKey[], in out A, in out I = A, in out ER = never, in out EW = never>
extends Pipeable.Class() implements Form<P, A, I, ER, EW> {
    readonly [FormTypeId]: FormTypeId = FormTypeId

    constructor(
        readonly path: P,
        readonly value: Subscribable.Subscribable<Option.Option<A>, ER, never>,
        readonly encodedValue: Lens.Lens<I, ER, EW, never, never>,
        readonly issues: Subscribable.Subscribable<readonly ParseResult.ArrayFormatterIssue[], never, never>,
        readonly isValidating: Subscribable.Subscribable<boolean, never, never>,
        readonly canSubmit: Subscribable.Subscribable<boolean, never, never>,
        readonly isSubmitting: Subscribable.Subscribable<boolean, never, never>,
    ) {
        super()
    }
}


export const RootFormTypeId: unique symbol = Symbol.for("@effect-fc/Form/RootForm")
export type RootFormTypeId = typeof RootFormTypeId

export interface RootForm<in out A, in out I = A, in out R = never, in out MA = void, in out ME = never, in out MR = never, in out MP = never>
extends Form<readonly [], A, I, never, never> {
    readonly schema: Schema.Schema<A, I, R>
    readonly context: Context.Context<Scope.Scope | R>
    readonly mutation: Mutation.Mutation<
        readonly [value: A, form: RootForm<A, I, R, unknown, unknown, unknown>],
        MA, ME, MR, MP
    >
    readonly autosubmit: boolean

    readonly validationFiber: Subscribable.Subscribable<Option.Option<Fiber.Fiber<A, ParseResult.ParseError>>, never, never>

    readonly run: Effect.Effect<void>
    readonly submit: Effect.Effect<Option.Option<Result.Final<MA, ME, MP>>, Cause.NoSuchElementException>
}

export class RootFormImpl<in out A, in out I = A, in out R = never, in out MA = void, in out ME = never, in out MR = never, in out MP = never>
extends Pipeable.Class() implements RootForm<A, I, R, MA, ME, MR, MP> {
    readonly [FormTypeId]: FormTypeId = FormTypeId
    readonly [RootFormTypeId]: RootFormTypeId = RootFormTypeId

    readonly path = [] as const

    constructor(
        readonly schema: Schema.Schema<A, I, R>,
        readonly context: Context.Context<Scope.Scope | R>,
        readonly mutation: Mutation.Mutation<
            readonly [value: A, form: RootForm<A, I, R, unknown, unknown, unknown>],
            MA, ME, MR, MP
        >,
        readonly autosubmit: boolean,

        readonly value: Lens.Lens<Option.Option<A>, never, never, never, never>,
        readonly encodedValue: Lens.Lens<I, never, never, never, never>,
        readonly issues: Lens.Lens<readonly ParseResult.ArrayFormatterIssue[], never, never, never, never>,
        readonly validationFiber: Lens.Lens<Option.Option<Fiber.Fiber<A, ParseResult.ParseError>>, never, never, never, never>,
        readonly isValidating: Subscribable.Subscribable<boolean, never, never>,

        readonly canSubmit: Subscribable.Subscribable<boolean, never, never>,
        readonly isSubmitting: Subscribable.Subscribable<boolean, never, never>,

        readonly runSemaphore: Effect.Semaphore,
    ) {
        super()
    }

    get run(): Effect.Effect<void> {
        return this.runSemaphore.withPermits(1)(Stream.runForEach(
            this.encodedValue.changes,

            encodedValue => Lens.get(this.validationFiber).pipe(
                Effect.andThen(Option.match({
                    onSome: Fiber.interrupt,
                    onNone: () => Effect.void,
                })),
                Effect.andThen(
                    Effect.forkScoped(Effect.onExit(
                        Schema.decode(this.schema, { errors: "all" })(encodedValue),
                        exit => Effect.andThen(
                            Exit.matchEffect(exit, {
                                onSuccess: v => Effect.andThen(
                                    Lens.set(this.value, Option.some(v)),
                                    Lens.set(this.issues, Array.empty()),
                                ),
                                onFailure: c => Option.match(Chunk.findFirst(Cause.failures(c), e => e._tag === "ParseError"), {
                                    onSome: e => Effect.flatMap(
                                        ParseResult.ArrayFormatter.formatError(e),
                                        v => Lens.set(this.issues, v),
                                    ),
                                    onNone: () => Effect.void,
                                }),
                            }),
                            Lens.set(this.validationFiber, Option.none()),
                        ),
                    )).pipe(
                        Effect.tap(fiber => Lens.set(this.validationFiber, Option.some(fiber))),
                        Effect.andThen(Fiber.join),
                        Effect.andThen(value => this.autosubmit
                            ? Effect.asVoid(Effect.forkScoped(this.submitValue(value)))
                            : Effect.void
                        ),
                        Effect.forkScoped,
                    )
                ),
                Effect.provide(this.context),
            ),
        ))
    }

    get submit(): Effect.Effect<Option.Option<Result.Final<MA, ME, MP>>, Cause.NoSuchElementException> {
        return Lens.get(this.value).pipe(
            Effect.andThen(identity),
            Effect.andThen(value => this.submitValue(value)),
        )
    }

    submitValue(value: A): Effect.Effect<Option.Option<Result.Final<MA, ME, MP>>> {
        return Effect.whenEffect(
            Effect.tap(
                this.mutation.mutate([value, this as any]),
                result => Result.isFailure(result)
                    ? Option.match(
                        Chunk.findFirst(
                            Cause.failures(result.cause as Cause.Cause<ParseResult.ParseError>),
                            e => e._tag === "ParseError",
                        ),
                        {
                            onSome: e => Effect.flatMap(
                                ParseResult.ArrayFormatter.formatError(e),
                                v => Lens.set(this.issues, v),
                            ),
                            onNone: () => Effect.void,
                        },
                    )
                    : Effect.void
            ),
            this.canSubmit.get,
        )
    }
}


export const isForm = (u: unknown): u is Form<readonly PropertyKey[], unknown, unknown> => Predicate.hasProperty(u, FormTypeId)
export const isRootForm = (u: unknown): u is RootForm<readonly PropertyKey[], unknown, unknown, unknown, unknown, unknown, unknown> => Predicate.hasProperty(u, RootFormTypeId)


export declare namespace make {
    export interface Options<in out A, in out I = A, in out R = never, in out MA = void, in out ME = never, in out MR = never, in out MP = never>
    extends Mutation.make.Options<
        readonly [value: NoInfer<A>, form: RootForm<NoInfer<A>, NoInfer<I>, NoInfer<R>, unknown, unknown, unknown>],
        MA, ME, MR, MP
    > {
        readonly schema: Schema.Schema<A, I, R>
        readonly initialEncodedValue: NoInfer<I>
        readonly autosubmit?: boolean
    }
}

export const make = Effect.fnUntraced(function* <A, I = A, R = never, MA = void, ME = never, MR = never, MP = never>(
    options: make.Options<A, I, R, MA, ME, MR, MP>
): Effect.fn.Return<
    RootForm<A, I, R, MA, ME, Result.forkEffect.OutputContext<MR, MP>, MP>,
    never,
    Scope.Scope | R | Result.forkEffect.OutputContext<MR, MP>
> {
    const mutation = yield* Mutation.make(options)
    const valueLens = Lens.fromSubscriptionRef(yield* SubscriptionRef.make(Option.none<A>()))
    const issuesLens = Lens.fromSubscriptionRef(yield* SubscriptionRef.make<readonly ParseResult.ArrayFormatterIssue[]>(Array.empty()))
    const validationFiberLens = Lens.fromSubscriptionRef(yield* SubscriptionRef.make(Option.none<Fiber.Fiber<A, ParseResult.ParseError>>()))

    return new RootFormImpl(
        options.schema,
        yield* Effect.context<Scope.Scope | R>(),
        mutation,
        options.autosubmit ?? false,

        valueLens,
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make(options.initialEncodedValue)),
        issuesLens,
        validationFiberLens,
        Subscribable.map(validationFiberLens, Option.isSome),

        Subscribable.map(
            Subscribable.zipLatestAll(valueLens, issuesLens, validationFiberLens, mutation.result),
            ([value, issues, validationFiber, result]) => (
                Option.isSome(value) &&
                Array.isEmptyReadonlyArray(issues) &&
                Option.isNone(validationFiber) &&
                !(Result.isRunning(result) || Result.hasRefreshingFlag(result))
            ),
        ),
        Subscribable.map(mutation.result, result => Result.isRunning(result) || Result.hasRefreshingFlag(result)),

        yield* Effect.makeSemaphore(1),
    )
})

export declare namespace service {
    export interface Options<in out A, in out I = A, in out R = never, in out MA = void, in out ME = never, in out MR = never, in out MP = never>
    extends make.Options<A, I, R, MA, ME, MR, MP> {}
}

export const service = <A, I = A, R = never, MA = void, ME = never, MR = never, MP = never>(
    options: service.Options<A, I, R, MA, ME, MR, MP>
): Effect.Effect<
    RootForm<A, I, R, MA, ME, Result.forkEffect.OutputContext<MR, MP>, MP>,
    never,
    Scope.Scope | R | Result.forkEffect.OutputContext<MR, MP>
> => Effect.tap(
    make(options),
    form => Effect.forkScoped(form.run),
)


const filterIssuesByPath = (
    issues: readonly ParseResult.ArrayFormatterIssue[],
    path: readonly PropertyKey[],
): readonly ParseResult.ArrayFormatterIssue[] => Array.filter(issues, issue =>
    issue.path.length >= path.length && Array.every(path, (p, i) => p === issue.path[i])
)

export const focusObjectField: {
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
        Subscribable.mapOption(form.value, a => a[key]),
        Lens.focusObjectField(form.encodedValue, key),
        Subscribable.map(form.issues, issues => filterIssuesByPath(issues, path)),
        form.isValidating,
        form.canSubmit,
        form.isSubmitting,
    )
})

export const focusArrayAt: {
    <P extends readonly PropertyKey[], A extends readonly any[], I extends readonly any[], ER, EW>(
        self: Form<P, A, I, ER, EW>,
        index: number,
    ): Form<readonly [...P, number], A[number], I[number], ER | Cause.NoSuchElementException, EW | Cause.NoSuchElementException>
    <P extends readonly PropertyKey[], A extends readonly any[], I extends readonly any[], ER, EW>(
        index: number,
    ): (self: Form<P, A, I, ER, EW>) => Form<readonly [...P, number], A[number], I[number], ER | Cause.NoSuchElementException, EW | Cause.NoSuchElementException>
} = Function.dual(2, <P extends readonly PropertyKey[], A extends readonly any[], I extends readonly any[], ER, EW>(
    self: Form<P, A, I, ER, EW>,
    index: number,
): Form<readonly [...P, number], A[number], I[number], ER | Cause.NoSuchElementException, EW | Cause.NoSuchElementException> => {
    const form = self as FormImpl<P, A, I, ER, EW>
    const path = [...form.path, index] as const

    return new FormImpl(
        path,
        Subscribable.mapOptionEffect(form.value, Array.get(index)),
        Lens.focusArrayAt(form.encodedValue, index),
        Subscribable.map(form.issues, issues => filterIssuesByPath(issues, path)),
        form.isValidating,
        form.canSubmit,
        form.isSubmitting,
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
        Subscribable.mapOption(form.value, Array.unsafeGet(index)),
        Lens.focusTupleAt(form.encodedValue, index),
        Subscribable.map(form.issues, issues => filterIssuesByPath(issues, path)),
        form.isValidating,
        form.canSubmit,
        form.isSubmitting,
    )
})

export const focusChunkAt: {
    <P extends readonly PropertyKey[], A, I, ER, EW>(
        self: Form<P, Chunk.Chunk<A>, Chunk.Chunk<I>, ER, EW>,
        index: number,
    ): Form<readonly [...P, number], A, I, ER | Cause.NoSuchElementException, EW>
    <P extends readonly PropertyKey[], A, I, ER, EW>(
        index: number,
    ): (self: Form<P, Chunk.Chunk<A>, Chunk.Chunk<I>, ER, EW>) => Form<readonly [...P, number], A, I, ER | Cause.NoSuchElementException, EW>
} = Function.dual(2, <P extends readonly PropertyKey[], A, I, ER, EW>(
    self: Form<P, Chunk.Chunk<A>, Chunk.Chunk<I>, ER, EW>,
    index: number,
): Form<readonly [...P, number], A, I, ER | Cause.NoSuchElementException, EW> => {
    const form = self as FormImpl<P, Chunk.Chunk<A>, Chunk.Chunk<I>, ER, EW>
    const path = [...form.path, index] as const

    return new FormImpl(
        path,
        Subscribable.mapOptionEffect(form.value, Chunk.get(index)),
        Lens.focusChunkAt(form.encodedValue, index),
        Subscribable.map(form.issues, issues => filterIssuesByPath(issues, path)),
        form.isValidating,
        form.canSubmit,
        form.isSubmitting,
    )
})


export namespace useInput {
    export interface Options {
        readonly debounce?: Duration.DurationInput
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
                Stream.drop(form.encodedValue.changes, 1),
                upstreamEncodedValue => Effect.whenEffect(
                    Lens.set(internalValueLens, upstreamEncodedValue),
                    Effect.andThen(Lens.get(internalValueLens), internalValue => !Equal.equals(upstreamEncodedValue, internalValue)),
                ),
            ),

            Stream.runForEach(
                internalValueLens.changes.pipe(
                    Stream.drop(1),
                    Stream.changesWith(Equal.equivalence()),
                    options?.debounce ? Stream.debounce(options.debounce) : identity,
                ),
                internalValue => Lens.set(form.encodedValue, internalValue),
            ),
        ], { concurrency: "unbounded" }))

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
                Stream.drop(field.encodedValue.changes, 1),

                upstreamEncodedValue => Effect.whenEffect(
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

                    Effect.andThen(
                        Effect.all([Lens.get(enabledLens), Lens.get(internalValueLens)]),
                        ([enabled, internalValue]) => !Equal.equals(upstreamEncodedValue, enabled ? Option.some(internalValue) : Option.none()),
                    ),
                ),
            ),

            Stream.runForEach(
                enabledLens.changes.pipe(
                    Stream.zipLatest(internalValueLens.changes),
                    Stream.drop(1),
                    Stream.changesWith(Equal.equivalence()),
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
