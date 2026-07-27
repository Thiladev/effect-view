import type { StandardSchemaV1 } from "@standard-schema/spec"
import { Array, type Context, Effect, Equal, Fiber, Option, Pipeable, Predicate, Schema, SchemaIssue, type Scope, Semaphore, Stream, SubscriptionRef } from "effect"
import * as Form from "./Form.js"
import * as Lens from "./Lens.js"
import * as View from "./View.js"


export const LensFormTypeId: unique symbol = Symbol.for("@effect-view/Form/LensForm")
export type LensFormTypeId = typeof LensFormTypeId

export interface LensForm<in out A, in out I = A, in out RD = never, in out RE = never, out TER = never, out TEW = never, in out TRR = never, in out TRW = never>
extends Form.Form<readonly [], A, I, TER, TER | TEW> {
    readonly [LensFormTypeId]: LensFormTypeId

    readonly schema: Schema.ConstraintCodec<A, I, RD, RE>
    readonly context: Context.Context<Scope.Scope | RD | RE | TRR | TRW>
    readonly target: Lens.Lens<A, TER, TEW, TRR, TRW>
    readonly validationFiber: View.View<Option.Option<Fiber.Fiber<A, Schema.SchemaError>>, never, never>

    readonly run: Effect.Effect<void, TER>
}

export class LensFormImpl<in out A, in out I = A, in out RD = never, in out RE = never, out TER = never, out TEW = never, in out TRR = never, in out TRW = never>
extends Pipeable.Class implements LensForm<A, I, RD, RE, TER, TEW, TRR, TRW> {
    readonly [Form.FormTypeId]: Form.FormTypeId = Form.FormTypeId
    readonly [LensFormTypeId]: LensFormTypeId = LensFormTypeId

    readonly path = [] as const

    readonly value: View.View<Option.Option<A>, never, never>
    readonly encodedValue: Lens.Lens<I, TER, TER | TEW, never, never>
    readonly isValidating: View.View<boolean, never, never>
    readonly canCommit: View.View<boolean, never, never>

    constructor(
        readonly schema: Schema.ConstraintCodec<A, I, RD, RE>,
        readonly context: Context.Context<Scope.Scope | RD | RE | TRR | TRW>,
        readonly target: Lens.Lens<A, TER, TEW, TRR, TRW>,

        readonly internalEncodedValue: Lens.Lens<I, never, never, never, never>,
        readonly issues: Lens.Lens<readonly StandardSchemaV1.Issue[], never, never, never, never>,
        readonly validationFiber: Lens.Lens<Option.Option<Fiber.Fiber<A, Schema.SchemaError>>, never, never, never, never>,
        readonly isCommitting: Lens.Lens<boolean, never, never>,

        readonly runSemaphore: Semaphore.Semaphore,
    ) {
        super()

        this.value = Effect.succeed(this).pipe(
            Effect.map(self => View.make({
                get: Effect.provide(Effect.option(self.target.get), self.context),
                get changes() {
                    return Stream.provideContext(
                        self.target.changes.pipe(
                            Stream.map(Option.some),
                            Stream.catch(() => Stream.make(Option.none())),
                        ),
                        self.context,
                    )
                },
            })),
            View.unwrap,
        )
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
                View.zipLatestAll(self.issues, self.validationFiber, self.isCommitting),
                ([issues, validationFiber, isCommitting]) => (
                    Array.isReadonlyArrayEmpty(issues) &&
                    Option.isNone(validationFiber) &&
                    !isCommitting
                ),
            )),
            View.unwrap,
        )
    }

    synchronizeEncodedValue(encodedValue: I): Effect.Effect<void, TER | TEW, never> {
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

            Effect.flatMap(value => Effect.ensuring(
                Lens.set(this.isCommitting, true).pipe(
                    Effect.andThen(Lens.set(this.issues, Array.empty())),
                    Effect.andThen(Lens.set(this.target, value)),
                ),
                Lens.set(this.isCommitting, false),
            )),
            Effect.catchIf(
                Schema.isSchemaError,
                error => Lens.set(this.issues, SchemaIssue.makeFormatterStandardSchemaV1()(error.issue).issues),
            ),

            Effect.provide(this.context),
        )
    }

    get run(): Effect.Effect<void, TER, never> {
        return this.runSemaphore.withPermits(1)(Effect.provide(
            Stream.runForEach(
                Stream.drop(Lens.changes(this.target), 1),
                targetValue => Schema.encodeEffect(this.schema, { errors: "all" })(targetValue).pipe(
                    Effect.flatMap(encodedValue => Effect.when(
                        Effect.andThen(
                            Lens.set(this.issues, Array.empty()),
                            Lens.set(this.internalEncodedValue, encodedValue),
                        ),
                        Effect.map(
                            Lens.get(this.internalEncodedValue),
                            currentEncodedValue => !Equal.equals(encodedValue, currentEncodedValue),
                        ),
                    )),
                    Effect.ignore,
                ),
            ),
            this.context,
        ))
    }
}

export const isLensForm = (u: unknown): u is LensForm<unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown> => Predicate.hasProperty(u, LensFormTypeId)


export declare namespace make {
    export interface Options<in out A, out I = A, out RD = never, out RE = never, out TER = never, out TEW = never, out TRR = never, out TRW = never> {
        readonly schema: Schema.ConstraintCodec<A, I, RD, RE>
        readonly target: Lens.Lens<A, TER, TEW, TRR, TRW>
        readonly initialEncodedValue?: NoInfer<I>
    }
}

export const make = Effect.fnUntraced(function* <A, I = A, RD = never, RE = never, TER = never, TEW = never, TRR = never, TRW = never>(
    options: make.Options<A, I, RD, RE, TER, TEW, TRR, TRW>
): Effect.fn.Return<
    LensForm<A, I, RD, RE, TER, TEW, TRR, TRW>,
    Schema.SchemaError | TER,
    Scope.Scope | RD | RE | TRR | TRW
> {
    const initialEncodedValue = options.initialEncodedValue !== undefined
        ? options.initialEncodedValue
        : yield* Effect.flatMap(
            Lens.get(options.target),
            Schema.encodeEffect(options.schema),
        )

    return new LensFormImpl(
        options.schema,
        yield* Effect.context<Scope.Scope | RD | RE | TRR | TRW>(),
        options.target,

        Lens.fromSubscriptionRef(yield* SubscriptionRef.make(initialEncodedValue)),
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make<readonly StandardSchemaV1.Issue[]>(Array.empty())),
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make(Option.none<Fiber.Fiber<A, Schema.SchemaError>>())),
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make(false)),

        yield* Semaphore.make(1),
    )
})

export declare namespace service {
    export interface Options<in out A, out I = A, out RD = never, out RE = never, out TER = never, out TEW = never, out TRR = never, out TRW = never>
    extends make.Options<A, I, RD, RE, TER, TEW, TRR, TRW> {}
}

export const service = <A, I = A, RD = never, RE = never, TER = never, TEW = never, TRR = never, TRW = never>(
    options: service.Options<A, I, RD, RE, TER, TEW, TRR, TRW>
): Effect.Effect<
    LensForm<A, I, RD, RE, TER, TEW, TRR, TRW>,
    Schema.SchemaError | TER,
    Scope.Scope | RD | RE | TRR | TRW
> => Effect.tap(
    make(options),
    form => Effect.forkScoped(form.run),
)
