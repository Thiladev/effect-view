import { Array, Cause, Chunk, type Context, Effect, Fiber, flow, identity, Option, ParseResult, Pipeable, Predicate, Schema, type Scope, SubscriptionRef } from "effect"
import * as Form from "./Form.js"
import * as Lens from "./Lens.js"
import * as Mutation from "./Mutation.js"
import * as Result from "./Result.js"
import * as Subscribable from "./Subscribable.js"


export const SubmittableFormTypeId: unique symbol = Symbol.for("@effect-fc/Form/SubmittableForm")
export type SubmittableFormTypeId = typeof SubmittableFormTypeId

export interface SubmittableForm<in out A, in out I = A, in out R = never, in out MA = void, in out ME = never, in out MR = never, in out MP = never>
extends Form.Form<readonly [], A, I, never, never> {
    readonly [SubmittableFormTypeId]: SubmittableFormTypeId

    readonly schema: Schema.Schema<A, I, R>
    readonly context: Context.Context<Scope.Scope | R>
    readonly mutation: Mutation.Mutation<
        readonly [value: A, form: SubmittableForm<A, I, R, unknown, unknown, unknown>],
        MA, ME, MR, MP
    >
    readonly validationFiber: Subscribable.Subscribable<Option.Option<Fiber.Fiber<A, ParseResult.ParseError>>, never, never>

    readonly run: Effect.Effect<void>
    readonly submit: Effect.Effect<Option.Option<Result.Final<MA, ME, MP>>, Cause.NoSuchElementException>
}

export class SubmittableFormImpl<in out A, in out I = A, in out R = never, in out MA = void, in out ME = never, in out MR = never, in out MP = never>
extends Pipeable.Class() implements SubmittableForm<A, I, R, MA, ME, MR, MP> {
    readonly [Form.FormTypeId]: Form.FormTypeId = Form.FormTypeId
    readonly [SubmittableFormTypeId]: SubmittableFormTypeId = SubmittableFormTypeId

    readonly path = [] as const

    readonly encodedValue: Lens.Lens<I, never, never, never, never>
    readonly isValidating: Subscribable.Subscribable<boolean, never, never>
    readonly canCommit: Subscribable.Subscribable<boolean, never, never>
    readonly isCommitting: Subscribable.Subscribable<boolean, never, never>

    constructor(
        readonly schema: Schema.Schema<A, I, R>,
        readonly context: Context.Context<Scope.Scope | R>,
        readonly mutation: Mutation.Mutation<
            readonly [value: A, form: SubmittableForm<A, I, R, unknown, unknown, unknown>],
            MA, ME, MR, MP
        >,
        readonly value: Lens.Lens<Option.Option<A>, never, never, never, never>,
        readonly internalEncodedValue: Lens.Lens<I, never, never, never, never>,
        readonly issues: Lens.Lens<readonly ParseResult.ArrayFormatterIssue[], never, never, never, never>,
        readonly validationFiber: Lens.Lens<Option.Option<Fiber.Fiber<A, ParseResult.ParseError>>, never, never, never, never>,

        readonly runSemaphore: Effect.Semaphore,
    ) {
        super()

        this.encodedValue = Effect.all([
            Effect.succeed(this),
            Effect.succeed(Lens.asLensImpl(this.internalEncodedValue)),
        ]).pipe(
            Effect.map(([self, parent]) => Lens.make({
                get: parent.get,
                get changes() { return parent.changes },
                commit: a => Effect.andThen(
                    Effect.flatMap(
                        parent.resolve,
                        resolved => resolved.commit(Effect.succeed(a)),
                    ),
                    self.synchronizeEncodedValue(a),
                ),
                lock: parent.lock,
            })),
            Lens.unwrap,
        )
        this.isValidating = Effect.succeed(this).pipe(
            Effect.map(self => Subscribable.map(self.validationFiber, Option.isSome)),
            Subscribable.unwrap,
        )
        this.canCommit = Effect.succeed(this).pipe(
            Effect.map(self => Subscribable.map(
                Subscribable.zipLatestAll(self.value, self.issues, self.validationFiber, self.mutation.result),
                ([value, issues, validationFiber, result]) => (
                    Option.isSome(value) &&
                    Array.isEmptyReadonlyArray(issues) &&
                    Option.isNone(validationFiber) &&
                    !(Result.isRunning(result) || Result.hasRefreshingFlag(result))
                ),
            )),
            Subscribable.unwrap,
        )
        this.isCommitting = Effect.succeed(this).pipe(
            Effect.map(self => Subscribable.map(
                self.mutation.result,
                result => Result.isRunning(result) || Result.hasRefreshingFlag(result),
            )),
            Subscribable.unwrap,
        )
    }

    synchronizeEncodedValue(encodedValue: I): Effect.Effect<void, never, never> {
        return Lens.get(this.validationFiber).pipe(
            Effect.andThen(Option.match({
                onSome: Fiber.interrupt,
                onNone: () => Effect.void,
            })),
            Effect.andThen(Effect.forkScoped(
                Effect.ensuring(
                    Schema.decode(this.schema, { errors: "all" })(encodedValue),
                    Lens.set(this.validationFiber, Option.none()),
                )
            )),
            Effect.tap(fiber => Lens.set(this.validationFiber, Option.some(fiber))),
            Effect.flatMap(Fiber.join),

            Effect.tap(() => Lens.set(this.issues, Array.empty())),
            Effect.flatMap(value => Lens.set(this.value, Option.some(value))),
            Effect.catchIf(
                ParseResult.isParseError,
                flow(
                    ParseResult.ArrayFormatter.formatError,
                    Effect.flatMap(v => Lens.set(this.issues, v)),
                ),
            ),

            Effect.provide(this.context),
        )
    }

    get run(): Effect.Effect<void, never, never> {
        return Lens.get(this.encodedValue).pipe(
            Effect.flatMap(v => Schema.decode(this.schema)(v)),
            Effect.option,
            Effect.flatMap(v => Lens.set(this.value, v)),
            Effect.provide(this.context),
            this.runSemaphore.withPermits(1),
        )
    }

    get submit(): Effect.Effect<Option.Option<Result.Final<MA, ME, MP>>, Cause.NoSuchElementException, never> {
        return Lens.get(this.value).pipe(
            Effect.flatMap(identity),
            Effect.flatMap(value => this.submitValue(value)),
        )
    }

    submitValue(value: A): Effect.Effect<Option.Option<Result.Final<MA, ME, MP>>, never, never> {
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
            this.canCommit.get,
        )
    }
}


export const isSubmittableForm = (u: unknown): u is SubmittableForm<unknown, unknown, unknown, unknown, unknown, unknown, unknown> => Predicate.hasProperty(u, SubmittableFormTypeId)


export declare namespace make {
    export interface Options<in out A, in out I = A, in out R = never, in out MA = void, in out ME = never, in out MR = never, in out MP = never>
    extends Mutation.make.Options<
        readonly [value: NoInfer<A>, form: SubmittableForm<NoInfer<A>, NoInfer<I>, NoInfer<R>, unknown, unknown, unknown>],
        MA, ME, MR, MP
    > {
        readonly schema: Schema.Schema<A, I, R>
        readonly initialEncodedValue: NoInfer<I>
    }
}

export const make = Effect.fnUntraced(function* <A, I = A, R = never, MA = void, ME = never, MR = never, MP = never>(
    options: make.Options<A, I, R, MA, ME, MR, MP>
): Effect.fn.Return<
    SubmittableForm<A, I, R, MA, ME, Result.forkEffect.OutputContext<MR, MP>, MP>,
    never,
    Scope.Scope | R | Result.forkEffect.OutputContext<MR, MP>
> {
    return new SubmittableFormImpl(
        options.schema,
        yield* Effect.context<Scope.Scope | R>(),
        yield* Mutation.make(options),

        Lens.fromSubscriptionRef(yield* SubscriptionRef.make(Option.none<A>())),
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make(options.initialEncodedValue)),
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make<readonly ParseResult.ArrayFormatterIssue[]>(Array.empty())),
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make(Option.none<Fiber.Fiber<A, ParseResult.ParseError>>())),

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
    SubmittableForm<A, I, R, MA, ME, Result.forkEffect.OutputContext<MR, MP>, MP>,
    never,
    Scope.Scope | R | Result.forkEffect.OutputContext<MR, MP>
> => Effect.tap(
    make(options),
    form => Effect.forkScoped(form.run),
)
