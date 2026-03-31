import { Cause, Context, Data, Effect, Equal, Exit, type Fiber, Hash, Layer, Match, pipe, Pipeable, Predicate, PubSub, Ref, type Scope, Stream, type Subscribable, SynchronizedRef } from "effect"
import { Lens } from "effect-lens"


export const ResultTypeId: unique symbol = Symbol.for("@effect-fc/Result/Result")
export type ResultTypeId = typeof ResultTypeId

export type Result<A, E = never, P = never> = (
    | Initial
    | Running<P>
    | Final<A, E, P>
)

// biome-ignore lint/complexity/noBannedTypes: "{}" is relevant here
export type Final<A, E = never, P = never> = (Success<A> | Failure<E>) & ({} | Flags<P>)
export type Flags<P = never> = WillFetch | WillRefresh | Refreshing<P>

export declare namespace Result {
    export type Success<R extends Result<any, any, any>> = [R] extends [Result<infer A, infer _E, infer _P>] ? A : never
    export type Failure<R extends Result<any, any, any>> = [R] extends [Result<infer _A, infer E, infer _P>] ? E : never
    export type Progress<R extends Result<any, any, any>> = [R] extends [Result<infer _A, infer _E, infer P>] ? P : never
}

export declare namespace Flags {
    export type Keys = keyof WillFetch & WillRefresh & Refreshing<any>
}

export interface Initial extends ResultPrototype {
    readonly _tag: "Initial"
}

export interface Running<P = never> extends ResultPrototype {
    readonly _tag: "Running"
    readonly progress: P
}

export interface Success<A> extends ResultPrototype {
    readonly _tag: "Success"
    readonly value: A
}

export interface Failure<E = never> extends ResultPrototype {
    readonly _tag: "Failure"
    readonly cause: Cause.Cause<E>
}

export interface WillFetch {
    readonly _flag: "WillFetch"
}

export interface WillRefresh {
    readonly _flag: "WillRefresh"
}

export interface Refreshing<P = never> {
    readonly _flag: "Refreshing"
    readonly progress: P
}


export interface ResultPrototype extends Pipeable.Pipeable, Equal.Equal {
    readonly [ResultTypeId]: ResultTypeId
}

export const ResultPrototype: ResultPrototype = Object.freeze({
    ...Pipeable.Prototype,
    [ResultTypeId]: ResultTypeId,

    [Equal.symbol](this: Result<any, any, any>, that: Result<any, any, any>): boolean {
        if (this._tag !== that._tag || (this as Flags)._flag !== (that as Flags)._flag)
            return false
        if (hasRefreshingFlag(this) && !Equal.equals(this.progress, (that as Refreshing<any>).progress))
            return false
        return Match.value(this).pipe(
            Match.tag("Initial", () => true),
            Match.tag("Running", self => Equal.equals(self.progress, (that as Running<any>).progress)),
            Match.tag("Success", self => Equal.equals(self.value, (that as Success<any>).value)),
            Match.tag("Failure", self => Equal.equals(self.cause, (that as Failure<any>).cause)),
            Match.exhaustive,
        )
    },

    [Hash.symbol](this: Result<any, any, any>): number {
        return pipe(Hash.string(this._tag),
            tagHash => Match.value(this).pipe(
                Match.tag("Initial", () => tagHash),
                Match.tag("Running", self => Hash.combine(Hash.hash(self.progress))(tagHash)),
                Match.tag("Success", self => Hash.combine(Hash.hash(self.value))(tagHash)),
                Match.tag("Failure", self => Hash.combine(Hash.hash(self.cause))(tagHash)),
                Match.exhaustive,
            ),
            Hash.combine(Hash.hash((this as Flags)._flag)),
            hash => hasRefreshingFlag(this)
                ? Hash.combine(Hash.hash(this.progress))(hash)
                : hash,
            Hash.cached(this),
        )
    },
} as const)


export const isResult = (u: unknown): u is Result<unknown, unknown, unknown> => Predicate.hasProperty(u, ResultTypeId)
export const isFinal = (u: unknown): u is Final<unknown, unknown, unknown> => isResult(u) && (isSuccess(u) || isFailure(u))
export const isInitial = (u: unknown): u is Initial => isResult(u) && u._tag === "Initial"
export const isRunning = (u: unknown): u is Running<unknown> => isResult(u) && u._tag === "Running"
export const isSuccess = (u: unknown): u is Success<unknown> => isResult(u) && u._tag === "Success"
export const isFailure = (u: unknown): u is Failure<unknown> => isResult(u) && u._tag === "Failure"
export const hasFlag = (u: unknown): u is Flags => isResult(u) && Predicate.hasProperty(u, "_flag")
export const hasWillFetchFlag = (u: unknown): u is WillFetch => isResult(u) && Predicate.hasProperty(u, "_flag") && u._flag === "WillFetch"
export const hasWillRefreshFlag = (u: unknown): u is WillRefresh => isResult(u) && Predicate.hasProperty(u, "_flag") && u._flag === "WillRefresh"
export const hasRefreshingFlag = (u: unknown): u is Refreshing<unknown> => isResult(u) && Predicate.hasProperty(u, "_flag") && u._flag === "Refreshing"

export const initial: {
    (): Initial
    <A, E = never, P = never>(): Result<A, E, P>
} = (): Initial => Object.setPrototypeOf({ _tag: "Initial" }, ResultPrototype)
export const running = <P = never>(progress?: P): Running<P> => Object.setPrototypeOf({ _tag: "Running", progress }, ResultPrototype)
export const succeed = <A>(value: A): Success<A> => Object.setPrototypeOf({ _tag: "Success", value }, ResultPrototype)
export const fail = <E>(cause: Cause.Cause<E> ): Failure<E> => Object.setPrototypeOf({ _tag: "Failure", cause }, ResultPrototype)

export const willFetch = <R extends Final<any, any, any>>(
    result: R
): Omit<R, keyof Flags.Keys> & WillFetch => Object.setPrototypeOf(
    Object.assign({}, result, { _flag: "WillFetch" }),
    Object.getPrototypeOf(result),
)

export const willRefresh = <R extends Final<any, any, any>>(
    result: R
): Omit<R, keyof Flags.Keys> & WillRefresh => Object.setPrototypeOf(
    Object.assign({}, result, { _flag: "WillRefresh" }),
    Object.getPrototypeOf(result),
)

export const refreshing = <R extends Final<any, any, any>, P = never>(
    result: R,
    progress?: P,
): Omit<R, keyof Flags.Keys> & Refreshing<P> => Object.setPrototypeOf(
    Object.assign({}, result, { _flag: "Refreshing", progress }),
    Object.getPrototypeOf(result),
)

export const fromExit: {
    <A, E>(exit: Exit.Success<A, E>): Success<A>
    <A, E>(exit: Exit.Failure<A, E>): Failure<E>
    <A, E>(exit: Exit.Exit<A, E>): Success<A> | Failure<E>
} = exit => (exit._tag === "Success" ? succeed(exit.value) : fail(exit.cause)) as any

export const toExit: {
    <A>(self: Success<A>): Exit.Success<A, never>
    <E>(self: Failure<E>): Exit.Failure<never, E>
    <A, E, P>(self: Final<A, E, P>): Exit.Exit<A, E>
    <A, E, P>(self: Result<A, E, P>): Exit.Exit<A, E | Cause.NoSuchElementException>
} = <A, E, P>(self: Result<A, E, P>): any => {
    switch (self._tag) {
        case "Success":
            return Exit.succeed(self.value)
        case "Failure":
            return Exit.failCause(self.cause)
        default:
            return Exit.fail(new Cause.NoSuchElementException())
    }
}


export interface Progress<P = never> {
    readonly progress: Lens.Lens<P, PreviousResultNotRunningNorRefreshing, never, never, never>
}
export const Progress = <P = never>(): Context.Tag<Progress<P>, Progress<P>> => Context.GenericTag("@effect-fc/Result/Progress")

export class PreviousResultNotRunningNorRefreshing extends Data.TaggedError("@effect-fc/Result/PreviousResultNotRunningNorRefreshing")<{
    readonly previous: Result<unknown, unknown, unknown>
}> {}

export const makeProgressLayer = <A, E, P = never>(
    state: Lens.Lens<Result<A, E, P>, never, never, never, never>
): Layer.Layer<Progress<P> | Progress<never>, never, never> => Layer.succeed(
    Progress<P>() as Context.Tag<Progress<P> | Progress<never>, Progress<P> | Progress<never>>,
    {
        progress: state.pipe(
            Lens.mapEffect(
                a => (isRunning(a) || hasRefreshingFlag(a))
                    ? Effect.succeed(a)
                    : Effect.fail(new PreviousResultNotRunningNorRefreshing({ previous: a })),
                (_, b) => Effect.succeed(b),
            ),
            Lens.map(
                a => a.progress,
                (a, b) => isRunning(a)
                    ? running(b)
                    : refreshing(a, b) as Final<A, E, P> & Refreshing<P>,
            ),
        )
    },
)


export namespace unsafeForkEffect {
    export type OutputContext<R, P> = Exclude<R, Progress<P> | Progress<never>>

    export interface Options<A, E, P> {
        readonly initial?: Initial | Final<A, E, P>
        readonly initialProgress?: P
    }
}

export const unsafeForkEffect = Effect.fnUntraced(function* <A, E, R, P = never>(
    effect: Effect.Effect<A, E, R>,
    options?: unsafeForkEffect.Options<NoInfer<A>, NoInfer<E>, P>,
): Effect.fn.Return<
    readonly [result: Subscribable.Subscribable<Result<A, E, P>, never, never>, fiber: Fiber.Fiber<A, E>],
    never,
    Scope.Scope | unsafeForkEffect.OutputContext<R, P>
> {
    const ref = yield* SynchronizedRef.make<Result<A, E, P>>(options?.initial ?? initial<A, E, P>())
    const pubsub = yield* PubSub.unbounded<Result<A, E, P>>()

    const state = Lens.make<Result<A, E, P>, never, never, never, never>({
        get get() { return Ref.get(ref) },
        get changes() {
            return Stream.unwrapScoped(Effect.map(
                Effect.all([Ref.get(ref), Stream.fromPubSub(pubsub, { scoped: true })]),
                ([latest, stream]) => Stream.concat(Stream.make(latest), stream),
            ))
        },
        modify: f => Ref.get(ref).pipe(
            Effect.flatMap(f),
            Effect.flatMap(([b, a]) => Ref.set(ref, a).pipe(
                Effect.as(b),
                Effect.zipLeft(PubSub.publish(pubsub, a))
            )),
        ),
    })

    const fiber = yield* Effect.gen(function*() {
        yield* Lens.set(
            state,
            (isFinal(options?.initial) && hasWillRefreshFlag(options?.initial))
                ? refreshing(options.initial, options?.initialProgress) as Result<A, E, P>
                : running(options?.initialProgress),
        )
        return yield* Effect.onExit(effect, exit => Effect.andThen(
            Lens.set(state, fromExit(exit)),
            Effect.forkScoped(PubSub.shutdown(pubsub)),
        ))
    }).pipe(
        Effect.forkScoped,
        Effect.provide(makeProgressLayer(state)),
    )

    return [state, fiber] as const
})

export namespace forkEffect {
    export type InputContext<R, P> = R extends Progress<infer X> ? [X] extends [P] ? R : never : R
    export type OutputContext<R, P> = unsafeForkEffect.OutputContext<R, P>
    export interface Options<A, E, P> extends unsafeForkEffect.Options<A, E, P> {}
}

export const forkEffect: {
    <A, E, R, P = never>(
        effect: Effect.Effect<A, E, forkEffect.InputContext<R, NoInfer<P>>>,
        options?: forkEffect.Options<NoInfer<A>, NoInfer<E>, P>,
    ): Effect.Effect<
        readonly [result: Subscribable.Subscribable<Result<A, E, P>, never, never>, fiber: Fiber.Fiber<A, E>],
        never,
        Scope.Scope | forkEffect.OutputContext<R, P>
    >
} = unsafeForkEffect
