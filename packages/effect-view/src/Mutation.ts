import { type Context, Effect, Option, Pipeable, Predicate, type Scope, type Stream, SubscriptionRef } from "effect"
import { AsyncResult } from "effect/reactivity"
import * as Lens from "./Lens.js"
import * as Operation from "./Operation.js"
import type * as View from "./View.js"


export const MutationTypeId: unique symbol = Symbol.for("@effect-view/Mutation/Mutation")
export type MutationTypeId = typeof MutationTypeId

export interface Mutation<in out K, out A, out E = never, in out R = never>
extends Pipeable.Pipeable {
    readonly [MutationTypeId]: MutationTypeId

    readonly context: Context.Context<Scope.Scope | R>
    readonly f: (key: K) => Effect.Effect<A, E, R>

    readonly latestKey: View.View<Option.Option<K>>
    readonly operation: View.View<Option.Option<Operation.Operation<Option.Some<K>, A, E, R>>>
    readonly state: View.View<MutationLatestState<K, A, E>>
    readonly latestFinalState: View.View<Option.Option<MutationFinalState<K, A, E>>>

    mutate(key: K): Effect.Effect<MutationFinalState<K, A, E>>
    mutateStream(key: K): Effect.Effect<Stream.Stream<MutationState<K, A, E>>>
}

export interface MutationLatestState<out K, out A, out E = never> {
    readonly key: Option.Option<K>
    readonly result: AsyncResult.AsyncResult<A, E>
}

export interface MutationState<out K, out A, out E = never> {
    readonly key: Option.Some<K>
    readonly result: AsyncResult.AsyncResult<A, E>
}

export interface MutationFinalState<out K, out A, out E = never> {
    readonly key: Option.Some<K>
    readonly result: AsyncResult.Success<A, E> | AsyncResult.Failure<A, E>
}

export const isMutation = (u: unknown): u is Mutation<unknown, unknown, unknown, unknown> => Predicate.hasProperty(u, MutationTypeId)


export class MutationImpl<in out K, in out A, in out E = never, in out R = never>
extends Pipeable.Class implements Mutation<K, A, E, R> {
    readonly [MutationTypeId]: MutationTypeId = MutationTypeId

    constructor(
        readonly context: Context.Context<Scope.Scope | R>,
        readonly f: (key: K) => Effect.Effect<A, E, R>,

        readonly latestKey: Lens.Lens<Option.Option<K>>,
        readonly operation: Lens.Lens<Option.Option<Operation.Operation<Option.Some<K>, A, E, R>>>,
        readonly state: Lens.Lens<MutationLatestState<K, A, E>>,
        readonly latestFinalState: Lens.Lens<Option.Option<MutationFinalState<K, A, E>>>,

    ) {
        super()
    }

    mutate(key: K): Effect.Effect<MutationFinalState<K, A, E>> {
        return this.start(key).pipe(
            Effect.flatMap(operation => operation.await),
            Effect.provide(this.context),
        )
    }
    mutateStream(key: K): Effect.Effect<Stream.Stream<MutationState<K, A, E>>> {
        return this.start(key).pipe(
            Effect.map(operation => operation.stream),
            Effect.provide(this.context),
        )
    }

    /** Starts a new Operation, which supersedes the current one without interrupting it. */
    start(key: K): Effect.Effect<
        Operation.Operation<Option.Some<K>, A, E, R>,
        never,
        Scope.Scope | R
    > {
        return Effect.gen({ self: this }, function*() {
            const latestFinalState = yield* Lens.get(this.latestFinalState)
            const operation = yield* Operation.make({
                key: Option.some(key) as Option.Some<K>,
                effect: this.f(key),
                previous: Option.isSome(latestFinalState)
                    ? latestFinalState.value.result
                    : AsyncResult.initial<A, E>(),
                listener: this.listener,
            })

            yield* Lens.set(this.latestKey, Option.some(key))
            yield* Lens.set(this.operation, Option.some(operation))
            yield* operation.start
            return operation
        })
    }

    /** Runs `effect` only if `operation` is the current Operation. */
    ifCurrent(operation: Operation.Operation<Option.Some<K>, A, E, R>, effect: Effect.Effect<void>): Effect.Effect<void> {
        return Effect.flatMap(
            Lens.get(this.operation),
            current => Option.isSome(current) && current.value === operation
                ? effect
                : Effect.void,
        )
    }

    /** Records the state of the current Operation. Superseded Operations are ignored. */
    get listener(): Operation.OperationListener<Option.Some<K>, A, E, R> {
        return {
            onChange: (operation, state) => this.ifCurrent(operation, Lens.set(this.state, state)),
            onSettle: (operation, state) => this.ifCurrent(operation, Lens.set(this.latestFinalState, Option.some(state))),
            onInterrupt: () => Effect.void,
        }
    }
}


export declare namespace make {
    export interface Options<K = never, A = void, E = never, R = never> {
        readonly f: (key: K) => Effect.Effect<A, E, R>
    }
}

export const make = Effect.fnUntraced(function* <K = never, A = void, E = never, R = never>(
    options: make.Options<K, A, E, R>
): Effect.fn.Return<
    Mutation<K, A, E, R>,
    never,
    Scope.Scope | R
> {
    return new MutationImpl(
        yield* Effect.context<Scope.Scope | R>(),
        options.f,

        Lens.fromSubscriptionRef(yield* SubscriptionRef.make(Option.none<K>())),
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make(Option.none<Operation.Operation<Option.Some<K>, A, E, R>>())),
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make<MutationLatestState<K, A, E>>({
            key: Option.none(),
            result: AsyncResult.initial(),
        })),
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make(Option.none<MutationFinalState<K, A, E>>())),
    )
})
