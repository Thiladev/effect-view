import { Cause, type Context, Deferred, Effect, Exit, Fiber, Function, Option, Pipeable, Predicate, Stream, SubscriptionRef } from "effect"
import { AsyncResult } from "effect/reactivity"
import * as AppConnectivity from "./AppConnectivity.js"
import * as Lens from "./Lens.js"
import type * as Query from "./Query.js"
import * as View from "./View.js"


export const OperationTypeId: unique symbol = Symbol.for("@effect-view/Operation/Operation")
export type OperationTypeId = typeof OperationTypeId

/**
 * A single run of a Query's or Mutation's effect for one key: owns its fiber and its state, from the previous result
 * through waiting to the final result.
 *
 * An Operation that is interrupted has no final state: its state stops waiting, and awaiting it is interrupted.
 */
export interface Operation<out K, out A, out E = never, in out R = never>
extends Pipeable.Pipeable {
    readonly [OperationTypeId]: OperationTypeId

    readonly context: Context.Context<Operation.Context<R>>
    readonly key: K
    readonly effect: Effect.Effect<A, E, R>

    readonly fiber: View.View<Option.Option<Fiber.Fiber<A, E>>>
    readonly state: View.View<OperationState<K, A, E>>
    /**
     * The successive states of the Operation, starting from the current one and ending once the Operation has settled or
     * aborted.
     */
    readonly stream: Stream.Stream<OperationState<K, A, E>>

    /**
     * Forks `effect` in the current scope, moving the state to waiting, then to the result of `effect`. Depending on the
     * network mode, the Operation may be paused while `online` is false (see `NetworkMode`).
     * Returns the running fiber, or `None` if it has already completed.
     */
    readonly start: Effect.Effect<Option.Option<Fiber.Fiber<A, E>>>
    readonly interrupt: Effect.Effect<void>
    /** Waits for the Operation to settle, and returns its final state. Interrupted if the Operation is interrupted. */
    readonly await: Effect.Effect<OperationFinalState<K, A, E>>
}

export namespace Operation {
    export type Context<R> = Query.Query.Context<R>
}

/** How an Operation reports to its owner (a Query or a Mutation). */
export interface OperationListener<in out K, in out A, in out E = never, in out R = never> {
    onChange(
        operation: Operation<K, A, E, R>,
        state: OperationState<K, A, E>,
    ): Effect.Effect<void>

    /** Called once, when the Operation settles with a final state. */
    onSettle(
        operation: Operation<K, A, E, R>,
        state: OperationFinalState<K, A, E>,
    ): Effect.Effect<void>

    /** Called once, when the Operation is interrupted before reaching a final state. */
    onInterrupt(
        operation: Operation<K, A, E, R>,
        state: OperationState<K, A, E>,
    ): Effect.Effect<void>
}

export interface OperationState<out K, out A, out E = never> {
    readonly key: K
    readonly result: AsyncResult.AsyncResult<A, E>
    /** Whether the Operation is waiting for a network connection before running its effect. */
    readonly paused: boolean
}

export interface OperationFinalState<out K, out A, out E = never> {
    readonly key: K
    readonly result: AsyncResult.Success<A, E> | AsyncResult.Failure<A, E>
    readonly paused: false
}

/**
 * - `"online"`: an Operation waits for a network connection (see `AppConnectivity`) before running, and is `paused`
 *   meanwhile.
 * - `"offlineFirst"`: an Operation runs once regardless of the network connection, e.g. for effects that may be served
 *   from a cache. If it fails while offline, it waits for a network connection, `paused` meanwhile, and runs again.
 * - `"always"`: Operations ignore the network connection, e.g. for effects that do not use the network.
 */
export type NetworkMode = "online" | "offlineFirst" | "always"

export const isOperation = (u: unknown): u is Operation<unknown, unknown, unknown, unknown> => Predicate.hasProperty(u, OperationTypeId)


export class OperationImpl<in out K, in out A, in out E = never, in out R = never>
extends Pipeable.Class implements Operation<K, A, E, R> {
    readonly [OperationTypeId]: OperationTypeId = OperationTypeId

    constructor(
        readonly context: Context.Context<Operation.Context<R>>,
        readonly key: K,
        readonly effect: Effect.Effect<A, E, R>,
        readonly listener: OperationListener<K, A, E, R>,
        readonly networkMode: NetworkMode,

        readonly fiber: Lens.Lens<Option.Option<Fiber.Fiber<A, E>>>,
        readonly state: Lens.Lens<OperationState<K, A, E>>,
        readonly result: Deferred.Deferred<OperationFinalState<K, A, E>>,
    ) {
        super()
    }

    get start(): Effect.Effect<Option.Option<Fiber.Fiber<A, E>>> {
        return Effect.gen({ self: this }, function*() {
            // Started immediately so that `onExit` is always registered, even if the fiber is interrupted right away:
            // otherwise the Operation would never settle or be reported as interrupted
            const fiber = yield* Effect.forkScoped(
                Effect.onExit(
                    Effect.andThen(
                        this.update(state => withWaiting(state, true)),
                        this.runWithNetworkMode,
                    ),
                    exit => Effect.flatMap(
                        Lens.get(this.state),
                        state => Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)
                            ? this.abort(withWaiting(state, false))
                            : this.settle(done(state, exit)),
                    ),
                ),
                { startImmediately: true },
            )

            // The fiber may already have completed and settled the Operation
            if (!fiber.pollUnsafe())
                yield* Lens.set(this.fiber, Option.some(fiber))
            return yield* Lens.get(this.fiber)
        }).pipe(
            Effect.provide(this.context)
        )
    }

    // biome-ignore lint/suspicious/useGetterReturn: the switch is exhaustive, which TypeScript checks
    get runWithNetworkMode(): Effect.Effect<A, E, AppConnectivity.AppConnectivity | R> {
        switch (this.networkMode) {
            case "online":
                return Effect.andThen(this.awaitOnline, this.effect)
            case "offlineFirst":
                return this.runRetryingOnReconnect
            case "always":
                return this.effect
        }
    }

    /** Runs `effect`, and if it fails while offline, waits for `online`, paused meanwhile, and runs it again. */
    get runRetryingOnReconnect(): Effect.Effect<A, E, AppConnectivity.AppConnectivity | R> {
        return Effect.catchCause(
            this.effect,
            cause => Effect.gen({ self: this }, function*() {
                const { online } = yield* AppConnectivity.AppConnectivity
                if (Cause.hasInterruptsOnly(cause) || (yield* View.get(online)))
                    return yield* Effect.failCause(cause)

                yield* this.awaitOnline
                return yield* this.runRetryingOnReconnect
            }),
        )
    }

    /** Waits for `online`, paused meanwhile. */
    get awaitOnline(): Effect.Effect<void, never, AppConnectivity.AppConnectivity> {
        return Effect.gen({ self: this }, function*() {
            const { online } = yield* AppConnectivity.AppConnectivity
            if (yield* View.get(online))
                return

            yield* this.update(state => ({ ...state, paused: true }))
            yield* Stream.runHead(Stream.filter(View.changes(online), Function.identity))
            yield* this.update(state => ({ ...state, paused: false }))
        })
    }

    get stream(): Stream.Stream<OperationState<K, A, E>> {
        // The state is waiting from the moment the Operation starts, and stops waiting once it has settled or aborted
        return Stream.takeUntil(View.changes(this.state), state => !state.result.waiting)
    }

    get interrupt(): Effect.Effect<void> {
        return Effect.flatMap(Lens.get(this.fiber), Option.match({
            onSome: Fiber.interrupt,
            onNone: () => Effect.void,
        }))
    }

    get await(): Effect.Effect<OperationFinalState<K, A, E>> {
        return Deferred.await(this.result)
    }

    update(
        f: (state: OperationState<K, A, E>) => OperationState<K, A, E>,
    ): Effect.Effect<OperationState<K, A, E>> {
        return Effect.tap(
            Lens.updateAndGet(this.state, f),
            state => this.listener.onChange(this, state),
        )
    }

    settle(state: OperationFinalState<K, A, E>): Effect.Effect<void> {
        return Effect.gen({ self: this }, function*() {
            yield* Lens.set(this.fiber, Option.none())
            yield* this.update(() => state)
            yield* this.listener.onSettle(this, state)
            yield* Deferred.succeed(this.result, state)
        })
    }

    abort(state: OperationState<K, A, E>): Effect.Effect<void> {
        return Effect.gen({ self: this }, function*() {
            yield* Lens.set(this.fiber, Option.none())
            yield* this.update(() => state)
            yield* this.listener.onInterrupt(this, state)
            yield* Deferred.interrupt(this.result)
        })
    }
}

export declare namespace make {
    export interface Options<K, A, E = never, R = never> {
        readonly key: K
        readonly effect: Effect.Effect<A, E, R>
        readonly previous: AsyncResult.AsyncResult<A, E>
        readonly listener: OperationListener<K, A, E, R>
        readonly networkMode: NetworkMode
    }
}

export const make = Effect.fnUntraced(function* <K, A, E = never, R = never>(
    options: make.Options<K, A, E, R>
): Effect.fn.Return<Operation<K, A, E, R>, never, Operation.Context<R>> {
    return new OperationImpl(
        yield* Effect.context<Operation.Context<R>>(),
        options.key,
        options.effect,
        options.listener,
        options.networkMode,

        Lens.fromSubscriptionRef(yield* SubscriptionRef.make(Option.none<Fiber.Fiber<A, E>>())),
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make<OperationState<K, A, E>>({
            key: options.key,
            result: options.previous,
            paused: false,
        })),
        yield* Deferred.make<OperationFinalState<K, A, E>>(),
    )
})

export declare namespace makeSettled {
    export interface Options<K, A, E = never, R = never> {
        readonly key: K
        readonly effect: Effect.Effect<A, E, R>
        readonly state: OperationFinalState<K, A, E>
    }
}

/**
 * Makes an Operation that has already settled with `state`, without running its effect, e.g. to serve a result from a
 * cache. Being already settled, it never notifies a listener.
 */
export const makeSettled = Effect.fnUntraced(function* <K, A, E = never, R = never>(
    options: makeSettled.Options<K, A, E, R>
): Effect.fn.Return<Operation<K, A, E, R>, never, Operation.Context<R>> {
    const result = yield* Deferred.make<OperationFinalState<K, A, E>>()
    yield* Deferred.succeed(result, options.state)

    return new OperationImpl(
        yield* Effect.context<Operation.Context<R>>(),
        options.key,
        options.effect,
        {
            onChange: () => Effect.void,
            onSettle: () => Effect.void,
            onInterrupt: () => Effect.void,
        },
        "always",

        Lens.fromSubscriptionRef(yield* SubscriptionRef.make(Option.none<Fiber.Fiber<A, E>>())),
        Lens.fromSubscriptionRef(yield* SubscriptionRef.make<OperationState<K, A, E>>(options.state)),
        result,
    )
})


const withWaiting = <K, A, E>(
    state: OperationState<K, A, E>,
    waiting: boolean,
): OperationState<K, A, E> => ({
    key: state.key,
    result: AsyncResult.match(state.result, {
        onInitial: () => AsyncResult.initial(waiting),
        onSuccess: result => AsyncResult.success(result.value, {
            waiting,
        }),
        onFailure: result => AsyncResult.failure(result.cause, {
            waiting,
            previousSuccess: result.previousSuccess,
        }),
    }),
    paused: false,
})

const done = <K, A, E>(
    state: OperationState<K, A, E>,
    exit: Exit.Exit<A, E>,
): OperationFinalState<K, A, E> => Exit.match(exit, {
    onSuccess: v => ({
        key: state.key,
        result: AsyncResult.success(v),
        paused: false,
    }),
    onFailure: c => ({
        key: state.key,
        result: AsyncResult.match(state.result, {
            onInitial: () => AsyncResult.failure(c),
            onSuccess: v => AsyncResult.failure(c, {
                previousSuccess: Option.some(v),
            }),
            onFailure: v => AsyncResult.failure(c, {
                previousSuccess: v.previousSuccess,
            }),
        }),
        paused: false,
    }),
})
