import { Array, type Context, Effect, Equal, Fiber, flow, Option, ParseResult, Pipeable, Predicate, Schema, type Scope, Stream, SubscriptionRef } from "effect"
import * as Form from "./Form.js"
import * as Lens from "./Lens.js"
import * as Subscribable from "./Subscribable.js"


export const SynchronizedFormTypeId: unique symbol = Symbol.for("@effect-fc/Form/SynchronizedForm")
export type SynchronizedFormTypeId = typeof SynchronizedFormTypeId

export interface SynchronizedForm<
    in out A,
    in out I = A,
    in out R = never,
    in out TER = never,
    in out TEW = never,
    in out TRR = never,
    in out TRW = never,
> extends Form.Form<readonly [], A, I, TER, TER | TEW> {
    readonly [SynchronizedFormTypeId]: SynchronizedFormTypeId

    readonly schema: Schema.Schema<A, I, R>
    readonly context: Context.Context<Scope.Scope | R | TRR | TRW>
    readonly target: Lens.Lens<A, TER, TEW, TRR, TRW>
    readonly validationFiber: Subscribable.Subscribable<Option.Option<Fiber.Fiber<A, ParseResult.ParseError>>, never, never>

    readonly run: Effect.Effect<void, TER>
}

export class SynchronizedFormImpl<
    in out A,
    in out I = A,
    in out R = never,
    in out TER = never,
    in out TEW = never,
    in out TRR = never,
    in out TRW = never,
> extends Pipeable.Class() implements SynchronizedForm<A, I, R, TER, TEW, TRR, TRW> {
    readonly [Form.FormTypeId]: Form.FormTypeId = Form.FormTypeId
    readonly [SynchronizedFormTypeId]: SynchronizedFormTypeId = SynchronizedFormTypeId

    readonly path = [] as const

    readonly value: Subscribable.Subscribable<Option.Option<A>, never, never>
    readonly encodedValue: Lens.Lens<I, TER, TER | TEW, never, never>
    readonly isValidating: Subscribable.Subscribable<boolean, never, never>
    readonly canCommit: Subscribable.Subscribable<boolean, never, never>

    constructor(
        readonly schema: Schema.Schema<A, I, R>,
        readonly context: Context.Context<Scope.Scope | R | TRR | TRW>,
        readonly target: Lens.Lens<A, TER, TEW, TRR, TRW>,

        readonly internalEncodedValue: Lens.Lens<I, never, never, never, never>,
        readonly issues: Lens.Lens<readonly ParseResult.ArrayFormatterIssue[], never, never, never, never>,
        readonly validationFiber: Lens.Lens<Option.Option<Fiber.Fiber<A, ParseResult.ParseError>>, never, never, never, never>,
        readonly isCommitting: Lens.Lens<boolean, never, never>,

        readonly runSemaphore: Effect.Semaphore,
    ) {
        super()

        this.value = Effect.succeed(this).pipe(
            Effect.map(self => Subscribable.make({
                get: Effect.provide(Effect.option(self.target.get), self.context),
                get changes() {
                    return Stream.provideContext(
                        self.target.changes.pipe(
                            Stream.map(Option.some),
                            Stream.catchAll(() => Stream.make(Option.none())),
                        ),
                        self.context,
                    )
                },
            })),
            Subscribable.unwrap,
        )
        this.encodedValue = Effect.all([
            Effect.succeed(this),
            Effect.succeed(Lens.asLensImpl(this.internalEncodedValue)),
        ]).pipe(
            Effect.map(([self, parent]) => Lens.make<I, TER, TER | TEW, never, never>({
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
                Subscribable.zipLatestAll(self.issues, self.validationFiber, self.isCommitting),
                ([issues, validationFiber, isCommitting]) => (
                    Array.isEmptyReadonlyArray(issues) &&
                    Option.isNone(validationFiber) &&
                    !isCommitting
                ),
            )),
            Subscribable.unwrap,
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
                    Schema.decode(this.schema, { errors: "all" })(encodedValue),
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
                ParseResult.isParseError,
                flow(
                    ParseResult.ArrayFormatter.formatError,
                    Effect.flatMap(v => Lens.set(this.issues, v)),
                ),
            ),

            Effect.provide(this.context),
        )
    }

    get run(): Effect.Effect<void, TER, never> {
        return this.runSemaphore.withPermits(1)(Effect.provide(
            Stream.runForEach(
                Stream.drop(this.target.changes, 1),
                targetValue => Schema.encode(this.schema, { errors: "all" })(targetValue).pipe(
                    Effect.flatMap(encodedValue => Effect.whenEffect(
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


export const isSynchronizedForm = (u: unknown): u is SynchronizedForm<unknown, unknown, unknown, unknown, unknown, unknown, unknown> => Predicate.hasProperty(u, SynchronizedFormTypeId)


export declare namespace make {
    export interface Options<in out A, in out I = A, in out R = never, in out TER = never, in out TEW = never, in out TRR = never, in out TRW = never> {
        readonly schema: Schema.Schema<A, I, R>
        readonly target: Lens.Lens<A, TER, TEW, TRR, TRW>
        readonly initialEncodedValue?: NoInfer<I>
    }
}

export const make = Effect.fnUntraced(function* <A, I = A, R = never, TER = never, TEW = never, TRR = never, TRW = never>(
    options: make.Options<A, I, R, TER, TEW, TRR, TRW>
): Effect.fn.Return<
    SynchronizedForm<A, I, R, TER, TEW, TRR, TRW>,
    ParseResult.ParseError | TER,
    Scope.Scope | R | TRR | TRW
> {
    const initialEncodedValue = options.initialEncodedValue !== undefined
        ? options.initialEncodedValue
        : yield* Effect.flatMap(
            Lens.get(options.target),
            Schema.encode(options.schema, { errors: "all" }),
        )

    return new SynchronizedFormImpl(
        options.schema,
        yield* Effect.context<Scope.Scope | R | TRR | TRW>(),
        options.target,

        Lens.fromSubscriptionRef(yield* SubscriptionRef.make(initialEncodedValue)),
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make<readonly ParseResult.ArrayFormatterIssue[]>(Array.empty())),
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make(Option.none<Fiber.Fiber<A, ParseResult.ParseError>>())),
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make(false)),

        yield* Effect.makeSemaphore(1),
    )
})

export declare namespace service {
    export interface Options<in out A, in out I = A, in out R = never, in out TER = never, in out TEW = never, in out TRR = never, in out TRW = never>
    extends make.Options<A, I, R, TER, TEW, TRR, TRW> {}
}

export const service = <A, I = A, R = never, TER = never, TEW = never, TRR = never, TRW = never>(
    options: service.Options<A, I, R, TER, TEW, TRR, TRW>
): Effect.Effect<
    SynchronizedForm<A, I, R, TER, TEW, TRR, TRW>,
    ParseResult.ParseError | TER,
    Scope.Scope | R | TRR | TRW
> => Effect.tap(
    make(options),
    form => Effect.forkScoped(form.run),
)
