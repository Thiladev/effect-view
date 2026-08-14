import type { StandardSchemaV1 } from "@standard-schema/spec"
import { Array, Cause, type Context, Effect, Fiber, Option, Pipeable, Predicate, Schema, SchemaIssue, type Scope, Semaphore, SubscriptionRef } from "effect"
import { AsyncResult } from "effect/unstable/reactivity"
import * as Form from "./Form.js"
import * as Lens from "./Lens.js"
import * as Mutation from "./Mutation.js"
import * as View from "./View.js"


export const MutationFormTypeId: unique symbol = Symbol.for("@effect-view/Form/MutationForm")
export type MutationFormTypeId = typeof MutationFormTypeId

export interface MutationForm<in out A, in out I = A, in out RD = never, in out RE = never, out MA = void, out ME = never, in out MR = never>
extends Form.Form<readonly [], A, I, never, never> {
    readonly [MutationFormTypeId]: MutationFormTypeId

    readonly schema: Schema.ConstraintCodec<A, I, RD, RE>
    readonly context: Context.Context<Scope.Scope | RD | RE>
    readonly mutation: Mutation.Mutation<
        readonly [value: A, form: MutationForm<A, I, RD, RE, unknown, unknown, unknown>],
        MA, ME, MR
    >
    readonly validationFiber: View.View<Option.Option<Fiber.Fiber<A, Schema.SchemaError>>, never, never>

    readonly run: Effect.Effect<void>
    readonly submit: Effect.Effect<Option.Option<AsyncResult.Success<MA, ME> | AsyncResult.Failure<MA, ME>>, Cause.NoSuchElementError>
}

export class MutationFormImpl<in out A, in out I = A, in out RD = never, in out RE = never, out MA = void, out ME = never, in out MR = never>
extends Pipeable.Class implements MutationForm<A, I, RD, RE, MA, ME, MR> {
    readonly [Form.FormTypeId]: Form.FormTypeId = Form.FormTypeId
    readonly [MutationFormTypeId]: MutationFormTypeId = MutationFormTypeId

    readonly path = [] as const

    readonly encodedValue: Lens.Lens<I, never, never, never, never>
    readonly isValidating: View.View<boolean, never, never>
    readonly canCommit: View.View<boolean, never, never>
    readonly isCommitting: View.View<boolean, never, never>

    constructor(
        readonly schema: Schema.ConstraintCodec<A, I, RD, RE>,
        readonly context: Context.Context<Scope.Scope | RD | RE>,
        readonly mutation: Mutation.Mutation<
            readonly [value: A, form: MutationForm<A, I, RD, RE, unknown, unknown, unknown>],
            MA, ME, MR
        >,
        readonly value: Lens.Lens<Option.Option<A>, never, never, never, never>,
        readonly internalEncodedValue: Lens.Lens<I, never, never, never, never>,
        readonly issues: Lens.Lens<readonly StandardSchemaV1.Issue[], never, never, never, never>,
        readonly validationFiber: Lens.Lens<Option.Option<Fiber.Fiber<A, Schema.SchemaError>>, never, never, never, never>,

        readonly runSemaphore: Semaphore.Semaphore,
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
            Effect.map(self => View.map(self.validationFiber, Option.isSome)),
            View.unwrap,
        )
        this.canCommit = Effect.succeed(this).pipe(
            Effect.map(self => View.map(
                View.zipLatestAll(self.value, self.issues, self.validationFiber, self.mutation.state),
                ([value, issues, validationFiber, result]) => (
                    Option.isSome(value) &&
                    Array.isReadonlyArrayEmpty(issues) &&
                    Option.isNone(validationFiber) &&
                    !AsyncResult.isWaiting(result)
                ),
            )),
            View.unwrap,
        )
        this.isCommitting = Effect.succeed(this).pipe(
            Effect.map(self => View.map(self.mutation.state, AsyncResult.isWaiting)),
            View.unwrap,
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
                    Schema.decodeEffect(this.schema, { errors: "all" })(encodedValue),
                    Lens.set(this.validationFiber, Option.none()),
                )
            )),
            Effect.tap(fiber => Lens.set(this.validationFiber, Option.some(fiber))),
            Effect.flatMap(Fiber.join),

            Effect.tap(() => Lens.set(this.issues, Array.empty())),
            Effect.flatMap(value => Lens.set(this.value, Option.some(value))),
            Effect.catchIf(
                Schema.isSchemaError,
                error => Lens.set(this.issues, SchemaIssue.makeFormatterStandardSchemaV1()(error.issue).issues),
            ),

            Effect.provide(this.context),
        )
    }

    get run(): Effect.Effect<void, never, never> {
        return Lens.get(this.encodedValue).pipe(
            Effect.flatMap(v => Schema.decodeEffect(this.schema)(v)),
            Effect.option,
            Effect.flatMap(v => Lens.set(this.value, v)),
            Effect.provide(this.context),
            this.runSemaphore.withPermits(1),
        )
    }

    get submit(): Effect.Effect<Option.Option<AsyncResult.Success<MA, ME> | AsyncResult.Failure<MA, ME>>, Cause.NoSuchElementError, never> {
        return Lens.get(this.value).pipe(
            Effect.flatMap(Effect.fromOption),
            Effect.flatMap(value => this.submitValue(value)),
        )
    }

    submitValue(value: A): Effect.Effect<Option.Option<AsyncResult.Success<MA, ME> | AsyncResult.Failure<MA, ME>>, never, never> {
        return Effect.when(
            Effect.tap(
                this.mutation.mutate([value, this as any]),
                result => AsyncResult.isFailure(result)
                    ? Option.match(
                        Array.findFirst(
                            result.cause.reasons,
                            reason => Cause.isFailReason(reason) && Schema.isSchemaError(reason.error)
                                ? Option.some(reason.error)
                                : Option.none(),
                        ),
                        {
                            onSome: error => Lens.set(this.issues, SchemaIssue.makeFormatterStandardSchemaV1()(error.issue).issues),
                            onNone: () => Effect.void,
                        },
                    )
                    : Effect.void,
            ),
            View.get(this.canCommit),
        )
    }
}

export const isMutationForm = (u: unknown): u is MutationForm<unknown, unknown, unknown, unknown, unknown, unknown, unknown> => Predicate.hasProperty(u, MutationFormTypeId)


export declare namespace make {
    export interface Options<in out A, in out I = A, in out RD = never, in out RE = never, out MA = void, out ME = never, out MR = never>
    extends Mutation.make.Options<
        readonly [value: NoInfer<A>, form: MutationForm<NoInfer<A>, NoInfer<I>, NoInfer<RD>, NoInfer<RE>, unknown, unknown, unknown>],
        MA, ME, MR
    > {
        readonly schema: Schema.ConstraintCodec<A, I, RD, RE>
        readonly initialEncodedValue: NoInfer<I>
    }
}

export const make = Effect.fnUntraced(function* <A, I = A, RD = never, RE = never, MA = void, ME = never, MR = never>(
    options: make.Options<A, I, RD, RE, MA, ME, MR>
): Effect.fn.Return<
    MutationForm<A, I, RD, RE, MA, ME, MR>,
    never,
    Scope.Scope | RD | RE | MR
> {
    return new MutationFormImpl(
        options.schema,
        yield* Effect.context<Scope.Scope | RD | RE | MR>(),
        yield* Mutation.make(options),

        Lens.fromSubscriptionRef(yield* SubscriptionRef.make(Option.none<A>())),
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make(options.initialEncodedValue)),
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make<readonly StandardSchemaV1.Issue[]>(Array.empty())),
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make(Option.none<Fiber.Fiber<A, Schema.SchemaError>>())),

        yield* Semaphore.make(1),
    )
})

export const thenRun = <A, I = A, RD = never, RE = never, MA = void, ME = never, MR = never, E = never, R = never>(
    self: Effect.Effect<MutationForm<A, I, RD, RE, MA, ME, MR>, E, R>,
): Effect.Effect<
    MutationForm<A, I, RD, RE, MA, ME, MR>,
    E,
    Scope.Scope | R
> => Effect.tap(
    self,
    form => Effect.forkScoped(form.run),
)
