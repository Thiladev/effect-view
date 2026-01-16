import { Array, Cause, Chunk, type Context, type Duration, Effect, Equal, Exit, Fiber, flow, Hash, HashMap, identity, Option, ParseResult, Pipeable, Predicate, Ref, Schema, type Scope, Stream } from "effect"
import type * as React from "react"
import * as Component from "./Component.js"
import * as Mutation from "./Mutation.js"
import * as PropertyPath from "./PropertyPath.js"
import * as Result from "./Result.js"
import * as Subscribable from "./Subscribable.js"
import * as SubscriptionRef from "./SubscriptionRef.js"
import * as SubscriptionSubRef from "./SubscriptionSubRef.js"


export const FormTypeId: unique symbol = Symbol.for("@effect-fc/Form/Form")
export type FormTypeId = typeof FormTypeId

export interface Form<in out A, in out I = A, in out R = never, in out MA = void, in out ME = never, in out MR = never, in out MP = never>
extends Pipeable.Pipeable {
    readonly [FormTypeId]: FormTypeId

    readonly schema: Schema.Schema<A, I, R>
    readonly context: Context.Context<Scope.Scope | R>
    readonly mutation: Mutation.Mutation<
        readonly [value: A, form: Form<A, I, R, unknown, unknown, unknown>],
        MA, ME, MR, MP
    >
    readonly autosubmit: boolean
    readonly debounce: Option.Option<Duration.DurationInput>

    readonly value: Subscribable.Subscribable<Option.Option<A>>
    readonly encodedValue: SubscriptionRef.SubscriptionRef<I>
    readonly error: Subscribable.Subscribable<Option.Option<ParseResult.ParseError>>
    readonly validationFiber: Subscribable.Subscribable<Option.Option<Fiber.Fiber<A, ParseResult.ParseError>>>

    readonly canSubmit: Subscribable.Subscribable<boolean>

    field<const P extends PropertyPath.Paths<I>>(
        path: P
    ): Effect.Effect<FormField<PropertyPath.ValueFromPath<A, P>, PropertyPath.ValueFromPath<I, P>>>

    readonly run: Effect.Effect<void>
    readonly submit: Effect.Effect<Option.Option<Result.Final<MA, ME, MP>>, Cause.NoSuchElementException>
}

export class FormImpl<in out A, in out I = A, in out R = never, in out MA = void, in out ME = never, in out MR = never, in out MP = never>
extends Pipeable.Class() implements Form<A, I, R, MA, ME, MR, MP> {
    readonly [FormTypeId]: FormTypeId = FormTypeId

    constructor(
        readonly schema: Schema.Schema<A, I, R>,
        readonly context: Context.Context<Scope.Scope | R>,
        readonly mutation: Mutation.Mutation<
            readonly [value: A, form: Form<A, I, R, unknown, unknown, unknown>],
            MA, ME, MR, MP
        >,
        readonly autosubmit: boolean,
        readonly debounce: Option.Option<Duration.DurationInput>,

        readonly value: SubscriptionRef.SubscriptionRef<Option.Option<A>>,
        readonly encodedValue: SubscriptionRef.SubscriptionRef<I>,
        readonly error: SubscriptionRef.SubscriptionRef<Option.Option<ParseResult.ParseError>>,
        readonly validationFiber: SubscriptionRef.SubscriptionRef<Option.Option<Fiber.Fiber<A, ParseResult.ParseError>>>,

        readonly runSemaphore: Effect.Semaphore,
        readonly fieldCache: Ref.Ref<HashMap.HashMap<FormFieldKey, FormField<unknown, unknown>>>,
    ) {
        super()

        this.canSubmit = Subscribable.map(
            Subscribable.zipLatestAll(this.value, this.error, this.validationFiber, this.mutation.result),
            ([value, error, validationFiber, result]) => (
                Option.isSome(value) &&
                Option.isNone(error) &&
                Option.isNone(validationFiber) &&
                !(Result.isRunning(result) || Result.hasRefreshingFlag(result))
            ),
        )
    }

    field<const P extends PropertyPath.Paths<I>>(
        path: P
    ): Effect.Effect<FormField<PropertyPath.ValueFromPath<A, P>, PropertyPath.ValueFromPath<I, P>>> {
        const key = new FormFieldKey(path)
        return this.fieldCache.pipe(
            Effect.map(HashMap.get(key)),
            Effect.flatMap(Option.match({
                onSome: v => Effect.succeed(v as FormField<PropertyPath.ValueFromPath<A, P>, PropertyPath.ValueFromPath<I, P>>),
                onNone: () => Effect.tap(
                    Effect.succeed(makeFormField(this as Form<A, I, R, MA, ME, MR, MP>, path)),
                    v => Ref.update(this.fieldCache, HashMap.set(key, v as FormField<unknown, unknown>)),
                ),
            })),
        )
    }

    readonly canSubmit: Subscribable.Subscribable<boolean>

    get run(): Effect.Effect<void> {
        return this.runSemaphore.withPermits(1)(Stream.runForEach(
            this.encodedValue.changes.pipe(
                Option.isSome(this.debounce) ? Stream.debounce(this.debounce.value) : identity
            ),

            encodedValue => this.validationFiber.pipe(
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
                                    Ref.set(this.value, Option.some(v)),
                                    Ref.set(this.error, Option.none()),
                                ),
                                onFailure: c => Option.match(Chunk.findFirst(Cause.failures(c), e => e._tag === "ParseError"), {
                                    onSome: e => Ref.set(this.error, Option.some(e)),
                                    onNone: () => Effect.void,
                                }),
                            }),
                            Ref.set(this.validationFiber, Option.none()),
                        ),
                    )).pipe(
                        Effect.tap(fiber => Ref.set(this.validationFiber, Option.some(fiber))),
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
        return this.value.pipe(
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
                            onSome: e => Ref.set(this.error, Option.some(e)),
                            onNone: () => Effect.void,
                        },
                    )
                    : Effect.void
            ),
            this.canSubmit.get,
        )
    }
}

export const isForm = (u: unknown): u is Form<unknown, unknown, unknown, unknown, unknown, unknown> => Predicate.hasProperty(u, FormTypeId)

export declare namespace make {
    export interface Options<in out A, in out I = A, in out R = never, in out MA = void, in out ME = never, in out MR = never, in out MP = never>
    extends Mutation.make.Options<
        readonly [value: NoInfer<A>, form: Form<NoInfer<A>, NoInfer<I>, NoInfer<R>, unknown, unknown, unknown>],
        MA, ME, MR, MP
    > {
        readonly schema: Schema.Schema<A, I, R>
        readonly initialEncodedValue: NoInfer<I>
        readonly autosubmit?: boolean
        readonly debounce?: Duration.DurationInput
    }
}

export const make = Effect.fnUntraced(function* <A, I = A, R = never, MA = void, ME = never, MR = never, MP = never>(
    options: make.Options<A, I, R, MA, ME, MR, MP>
): Effect.fn.Return<
    Form<A, I, R, MA, ME, Result.forkEffect.OutputContext<MA, ME, MR, MP>, MP>,
    never,
    Scope.Scope | R | Result.forkEffect.OutputContext<MA, ME, MR, MP>
> {
    return new FormImpl(
        options.schema,
        yield* Effect.context<Scope.Scope | R>(),
        yield* Mutation.make(options),
        options.autosubmit ?? false,
        Option.fromNullable(options.debounce),

        yield* SubscriptionRef.make(Option.none<A>()),
        yield* SubscriptionRef.make(options.initialEncodedValue),
        yield* SubscriptionRef.make(Option.none<ParseResult.ParseError>()),
        yield* SubscriptionRef.make(Option.none<Fiber.Fiber<A, ParseResult.ParseError>>()),

        yield* Effect.makeSemaphore(1),
        yield* Ref.make(HashMap.empty<FormFieldKey, FormField<unknown, unknown>>()),
    )
})

export declare namespace service {
    export interface Options<in out A, in out I = A, in out R = never, in out MA = void, in out ME = never, in out MR = never, in out MP = never>
    extends make.Options<A, I, R, MA, ME, MR, MP> {}
}

export const service = <A, I = A, R = never, MA = void, ME = never, MR = never, MP = never>(
    options: service.Options<A, I, R, MA, ME, MR, MP>
): Effect.Effect<
    Form<A, I, R, MA, ME, Result.forkEffect.OutputContext<MA, ME, MR, MP>, MP>,
    never,
    Scope.Scope | R | Result.forkEffect.OutputContext<MA, ME, MR, MP>
> => Effect.tap(
    make(options),
    form => Effect.forkScoped(form.run),
)


export const FormFieldTypeId: unique symbol = Symbol.for("@effect-fc/Form/FormField")
export type FormFieldTypeId = typeof FormFieldTypeId

export interface FormField<in out A, in out I = A>
extends Pipeable.Pipeable {
    readonly [FormFieldTypeId]: FormFieldTypeId

    readonly value: Subscribable.Subscribable<Option.Option<A>, Cause.NoSuchElementException>
    readonly encodedValue: SubscriptionRef.SubscriptionRef<I>
    readonly issues: Subscribable.Subscribable<readonly ParseResult.ArrayFormatterIssue[]>
    readonly isValidating: Subscribable.Subscribable<boolean>
    readonly isSubmitting: Subscribable.Subscribable<boolean>
}

class FormFieldImpl<in out A, in out I = A>
extends Pipeable.Class() implements FormField<A, I> {
    readonly [FormFieldTypeId]: FormFieldTypeId = FormFieldTypeId

    constructor(
        readonly value: Subscribable.Subscribable<Option.Option<A>, Cause.NoSuchElementException>,
        readonly encodedValue: SubscriptionRef.SubscriptionRef<I>,
        readonly issues: Subscribable.Subscribable<readonly ParseResult.ArrayFormatterIssue[]>,
        readonly isValidating: Subscribable.Subscribable<boolean>,
        readonly isSubmitting: Subscribable.Subscribable<boolean>,
    ) {
        super()
    }
}

const FormFieldKeyTypeId: unique symbol = Symbol.for("@effect-fc/Form/FormFieldKey")
type FormFieldKeyTypeId = typeof FormFieldKeyTypeId

class FormFieldKey implements Equal.Equal {
    readonly [FormFieldKeyTypeId]: FormFieldKeyTypeId = FormFieldKeyTypeId
    constructor(readonly path: PropertyPath.PropertyPath) {}

    [Equal.symbol](that: Equal.Equal) {
        return isFormFieldKey(that) && PropertyPath.equivalence(this.path, that.path)
    }
    [Hash.symbol]() {
        return Hash.array(this.path)
    }
}

export const isFormField = (u: unknown): u is FormField<unknown, unknown> => Predicate.hasProperty(u, FormFieldTypeId)
const isFormFieldKey = (u: unknown): u is FormFieldKey => Predicate.hasProperty(u, FormFieldKeyTypeId)

export const makeFormField = <A, I, R, MA, ME, MR, MP, const P extends PropertyPath.Paths<NoInfer<I>>>(
    self: Form<A, I, R, MA, ME, MR, MP>,
    path: P,
): FormField<PropertyPath.ValueFromPath<A, P>, PropertyPath.ValueFromPath<I, P>> => {
    return new FormFieldImpl(
        Subscribable.mapEffect(self.value, Option.match({
            onSome: v => Option.map(PropertyPath.get(v, path), Option.some),
            onNone: () => Option.some(Option.none()),
        })),
        SubscriptionSubRef.makeFromPath(self.encodedValue, path),
        Subscribable.mapEffect(self.error, Option.match({
            onSome: flow(
                ParseResult.ArrayFormatter.formatError,
                Effect.map(Array.filter(issue => PropertyPath.equivalence(issue.path, path))),
            ),
            onNone: () => Effect.succeed([]),
        })),
        Subscribable.map(self.validationFiber, Option.isSome),
        Subscribable.map(self.mutation.result, result => Result.isRunning(result) || Result.hasRefreshingFlag(result)),
    )
}


export namespace useInput {
    export interface Options {
        readonly debounce?: Duration.DurationInput
    }

    export interface Success<T> {
        readonly value: T
        readonly setValue: React.Dispatch<React.SetStateAction<T>>
    }
}

export const useInput = Effect.fnUntraced(function* <A, I>(
    field: FormField<A, I>,
    options?: useInput.Options,
): Effect.fn.Return<useInput.Success<I>, Cause.NoSuchElementException, Scope.Scope> {
    const internalValueRef = yield* Component.useOnChange(() => Effect.tap(
        Effect.andThen(field.encodedValue, SubscriptionRef.make),
        internalValueRef => Effect.forkScoped(Effect.all([
            Stream.runForEach(
                Stream.drop(field.encodedValue, 1),
                upstreamEncodedValue => Effect.whenEffect(
                    Ref.set(internalValueRef, upstreamEncodedValue),
                    Effect.andThen(internalValueRef, internalValue => !Equal.equals(upstreamEncodedValue, internalValue)),
                ),
            ),

            Stream.runForEach(
                internalValueRef.changes.pipe(
                    Stream.drop(1),
                    Stream.changesWith(Equal.equivalence()),
                    options?.debounce ? Stream.debounce(options.debounce) : identity,
                ),
                internalValue => Ref.set(field.encodedValue, internalValue),
            ),
        ], { concurrency: "unbounded" })),
    ), [field, options?.debounce])

    const [value, setValue] = yield* SubscriptionRef.useSubscriptionRefState(internalValueRef)
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

export const useOptionalInput = Effect.fnUntraced(function* <A, I>(
    field: FormField<A, Option.Option<I>>,
    options: useOptionalInput.Options<I>,
): Effect.fn.Return<useOptionalInput.Success<I>, Cause.NoSuchElementException, Scope.Scope> {
    const [enabledRef, internalValueRef] = yield* Component.useOnChange(() => Effect.tap(
        Effect.andThen(
            field.encodedValue,
            Option.match({
                onSome: v => Effect.all([SubscriptionRef.make(true), SubscriptionRef.make(v)]),
                onNone: () => Effect.all([SubscriptionRef.make(false), SubscriptionRef.make(options.defaultValue)]),
            }),
        ),

        ([enabledRef, internalValueRef]) => Effect.forkScoped(Effect.all([
            Stream.runForEach(
                Stream.drop(field.encodedValue, 1),

                upstreamEncodedValue => Effect.whenEffect(
                    Option.match(upstreamEncodedValue, {
                        onSome: v => Effect.andThen(
                            Ref.set(enabledRef, true),
                            Ref.set(internalValueRef, v),
                        ),
                        onNone: () => Effect.andThen(
                            Ref.set(enabledRef, false),
                            Ref.set(internalValueRef, options.defaultValue),
                        ),
                    }),

                    Effect.andThen(
                        Effect.all([enabledRef, internalValueRef]),
                        ([enabled, internalValue]) => !Equal.equals(upstreamEncodedValue, enabled ? Option.some(internalValue) : Option.none()),
                    ),
                ),
            ),

            Stream.runForEach(
                enabledRef.changes.pipe(
                    Stream.zipLatest(internalValueRef.changes),
                    Stream.drop(1),
                    Stream.changesWith(Equal.equivalence()),
                    options?.debounce ? Stream.debounce(options.debounce) : identity,
                ),
                ([enabled, internalValue]) => Ref.set(field.encodedValue, enabled ? Option.some(internalValue) : Option.none()),
            ),
        ], { concurrency: "unbounded" })),
    ), [field, options.debounce])

    const [enabled, setEnabled] = yield* SubscriptionRef.useSubscriptionRefState(enabledRef)
    const [value, setValue] = yield* SubscriptionRef.useSubscriptionRefState(internalValueRef)
    return { enabled, setEnabled, value, setValue }
})
