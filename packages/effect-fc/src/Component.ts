/** biome-ignore-all lint/complexity/noBannedTypes: {} is the default type for React props */
/** biome-ignore-all lint/complexity/useArrowFunction: necessary for class prototypes */
import { Context, type Duration, Effect, Effectable, Equivalence, ExecutionStrategy, Exit, Fiber, Function, HashMap, Layer, ManagedRuntime, Option, Predicate, Ref, Runtime, Scope, Tracer, type Utils } from "effect"
import * as React from "react"
import { Memoized } from "./index.js"


export const TypeId: unique symbol = Symbol.for("@effect-fc/Component/Component")
export type TypeId = typeof TypeId

/**
 * Interface representing an Effect-based React Component.
 *
 * This is both:
 * - an Effect that produces a React function component
 * - a constructor-like object with component metadata and options
 */
export interface Component<P extends {}, A extends React.ReactNode, E, R>
extends
    Effect.Effect<(props: P) => A, never, Exclude<R, Scope.Scope>>,
    Component.Options
{
    new(_: never): Record<string, never>
    readonly [TypeId]: TypeId
    readonly "~Props": P
    readonly "~Success": A
    readonly "~Error": E
    readonly "~Context": R

    readonly body: (props: P) => Effect.Effect<A, E, R>

    /** @internal */
    makeFunctionComponent(
        runtimeRef: React.Ref<Runtime.Runtime<Exclude<R, Scope.Scope>>>
    ): (props: P) => A
}

export declare namespace Component {
    export type Props<T extends Component<any, any, any, any>> = [T] extends [Component<infer P, infer _A, infer _E, infer _R>] ? P : never
    export type Success<T extends Component<any, any, any, any>> = [T] extends [Component<infer _P, infer A, infer _E, infer _R>] ? A : never
    export type Error<T extends Component<any, any, any, any>> = [T] extends [Component<infer _P, infer _A, infer E, infer _R>] ? E : never
    export type Context<T extends Component<any, any, any, any>> = [T] extends [Component<infer _P, infer _A, infer _E, infer R>] ? R : never

    export type AsComponent<T extends Component<any, any, any, any>> = Component<Props<T>, Success<T>, Error<T>, Context<T>>

    /**
     * Options that can be set on the component
     */
    export interface Options {
        /** Custom displayName for React DevTools and debugging. */
        readonly displayName?: string

        /**
         * Strategy used when executing finalizers on unmount/scope close.
         * @default ExecutionStrategy.sequential
         */
        readonly finalizerExecutionStrategy: ExecutionStrategy.ExecutionStrategy

        /**
         * Debounce time before executing finalizers after component unmount.
         * Helps avoid unnecessary work during fast remount/remount cycles.
         * @default "100 millis"
         */
        readonly finalizerExecutionDebounce: Duration.DurationInput
    }
}


const ComponentProto = Object.freeze({
    ...Effectable.CommitPrototype,
    [TypeId]: TypeId,

    commit: Effect.fnUntraced(function* <P extends {}, A extends React.ReactNode, E, R>(
        this: Component<P, A, E, R>
    ) {
        // biome-ignore lint/style/noNonNullAssertion: React ref initialization
        const runtimeRef = React.useRef<Runtime.Runtime<Exclude<R, Scope.Scope>>>(null!)
        runtimeRef.current = yield* Effect.runtime<Exclude<R, Scope.Scope>>()

        return yield* React.useState(() => Runtime.runSync(runtimeRef.current)(Effect.cachedFunction(
            (_services: readonly any[]) => Effect.sync(() => {
                const f: React.FC<P> = this.makeFunctionComponent(runtimeRef)
                f.displayName = this.displayName ?? "Anonymous"
                return Memoized.isMemoized(this)
                    ? React.memo(f, this.propsAreEqual)
                    : f
            }),
            Equivalence.array(Equivalence.strict()),
        )))[0](Array.from(
            Context.omit(...nonReactiveTags)(runtimeRef.current.context).unsafeMap.values()
        ))
    }),

    makeFunctionComponent<P extends {}, A extends React.ReactNode, E, R>(
        this: Component<P, A, E, R>,
        runtimeRef: React.RefObject<Runtime.Runtime<Exclude<R, Scope.Scope>>>,
    ) {
        return (props: P) => Runtime.runSync(runtimeRef.current)(
            Effect.andThen(
                useScope([], this),
                scope => Effect.provideService(this.body(props), Scope.Scope, scope),
            )
        )
    },
} as const)

const defaultOptions: Component.Options = {
    finalizerExecutionStrategy: ExecutionStrategy.sequential,
    finalizerExecutionDebounce: "100 millis",
}

const nonReactiveTags = [Tracer.ParentSpan] as const


export const isComponent = (u: unknown): u is Component<{}, React.ReactNode, unknown, unknown> => Predicate.hasProperty(u, TypeId)

export declare namespace make {
    export type Gen = {
        <Eff extends Utils.YieldWrap<Effect.Effect<any, any, any>>, A extends React.ReactNode, P extends {} = {}>(
            body: (props: P) => Generator<Eff, A, never>
        ): Component<
            P, A,
            [Eff] extends [never] ? never : [Eff] extends [Utils.YieldWrap<Effect.Effect<infer _A, infer E, infer _R>>] ? E : never,
            [Eff] extends [never] ? never : [Eff] extends [Utils.YieldWrap<Effect.Effect<infer _A, infer _E, infer R>>] ? R : never
        >
        <Eff extends Utils.YieldWrap<Effect.Effect<any, any, any>>, A, B extends Effect.Effect<React.ReactNode, any, any>, P extends {} = {}>(
            body: (props: P) => Generator<Eff, A, never>,
            a: (
                _: Effect.Effect<
                    A,
                    [Eff] extends [never] ? never : [Eff] extends [Utils.YieldWrap<Effect.Effect<infer _A, infer E, infer _R>>] ? E : never,
                    [Eff] extends [never] ? never : [Eff] extends [Utils.YieldWrap<Effect.Effect<infer _A, infer _E, infer R>>] ? R : never
                >,
                props: NoInfer<P>,
            ) => B,
        ): Component<P, Effect.Effect.Success<Effect.Effect.AsEffect<B>>, Effect.Effect.Error<B>, Effect.Effect.Context<B>>
        <Eff extends Utils.YieldWrap<Effect.Effect<any, any, any>>, A, B, C extends Effect.Effect<React.ReactNode, any, any>, P extends {} = {}>(
            body: (props: P) => Generator<Eff, A, never>,
            a: (
                _: Effect.Effect<
                    A,
                    [Eff] extends [never] ? never : [Eff] extends [Utils.YieldWrap<Effect.Effect<infer _A, infer E, infer _R>>] ? E : never,
                    [Eff] extends [never] ? never : [Eff] extends [Utils.YieldWrap<Effect.Effect<infer _A, infer _E, infer R>>] ? R : never
                >,
                props: NoInfer<P>,
            ) => B,
            b: (_: B, props: NoInfer<P>) => C,
        ): Component<P, Effect.Effect.Success<Effect.Effect.AsEffect<C>>, Effect.Effect.Error<C>, Effect.Effect.Context<C>>
        <Eff extends Utils.YieldWrap<Effect.Effect<any, any, any>>, A, B, C, D extends Effect.Effect<React.ReactNode, any, any>, P extends {} = {}>(
            body: (props: P) => Generator<Eff, A, never>,
            a: (
                _: Effect.Effect<
                    A,
                    [Eff] extends [never] ? never : [Eff] extends [Utils.YieldWrap<Effect.Effect<infer _A, infer E, infer _R>>] ? E : never,
                    [Eff] extends [never] ? never : [Eff] extends [Utils.YieldWrap<Effect.Effect<infer _A, infer _E, infer R>>] ? R : never
                >,
                props: NoInfer<P>,
            ) => B,
            b: (_: B, props: NoInfer<P>) => C,
            c: (_: C, props: NoInfer<P>) => D,
        ): Component<P, Effect.Effect.Success<Effect.Effect.AsEffect<D>>, Effect.Effect.Error<D>, Effect.Effect.Context<D>>
        <Eff extends Utils.YieldWrap<Effect.Effect<any, any, any>>, A, B, C, D, E extends Effect.Effect<React.ReactNode, any, any>, P extends {} = {}>(
            body: (props: P) => Generator<Eff, A, never>,
            a: (
                _: Effect.Effect<
                    A,
                    [Eff] extends [never] ? never : [Eff] extends [Utils.YieldWrap<Effect.Effect<infer _A, infer E, infer _R>>] ? E : never,
                    [Eff] extends [never] ? never : [Eff] extends [Utils.YieldWrap<Effect.Effect<infer _A, infer _E, infer R>>] ? R : never
                >,
                props: NoInfer<P>,
            ) => B,
            b: (_: B, props: NoInfer<P>) => C,
            c: (_: C, props: NoInfer<P>) => D,
            d: (_: D, props: NoInfer<P>) => E,
        ): Component<P, Effect.Effect.Success<Effect.Effect.AsEffect<E>>, Effect.Effect.Error<E>, Effect.Effect.Context<E>>
        <Eff extends Utils.YieldWrap<Effect.Effect<any, any, any>>, A, B, C, D, E, F extends Effect.Effect<React.ReactNode, any, any>, P extends {} = {}>(
            body: (props: P) => Generator<Eff, A, never>,
            a: (
                _: Effect.Effect<
                    A,
                    [Eff] extends [never] ? never : [Eff] extends [Utils.YieldWrap<Effect.Effect<infer _A, infer E, infer _R>>] ? E : never,
                    [Eff] extends [never] ? never : [Eff] extends [Utils.YieldWrap<Effect.Effect<infer _A, infer _E, infer R>>] ? R : never
                >,
                props: NoInfer<P>,
            ) => B,
            b: (_: B, props: NoInfer<P>) => C,
            c: (_: C, props: NoInfer<P>) => D,
            d: (_: D, props: NoInfer<P>) => E,
            e: (_: E, props: NoInfer<P>) => F,
        ): Component<P, Effect.Effect.Success<Effect.Effect.AsEffect<F>>, Effect.Effect.Error<F>, Effect.Effect.Context<F>>
        <Eff extends Utils.YieldWrap<Effect.Effect<any, any, any>>, A, B, C, D, E, F, G extends Effect.Effect<React.ReactNode, any, any>, P extends {} = {}>(
            body: (props: P) => Generator<Eff, A, never>,
            a: (
                _: Effect.Effect<
                    A,
                    [Eff] extends [never] ? never : [Eff] extends [Utils.YieldWrap<Effect.Effect<infer _A, infer E, infer _R>>] ? E : never,
                    [Eff] extends [never] ? never : [Eff] extends [Utils.YieldWrap<Effect.Effect<infer _A, infer _E, infer R>>] ? R : never
                >,
                props: NoInfer<P>,
            ) => B,
            b: (_: B, props: NoInfer<P>) => C,
            c: (_: C, props: NoInfer<P>) => D,
            d: (_: D, props: NoInfer<P>) => E,
            e: (_: E, props: NoInfer<P>) => F,
            f: (_: F, props: NoInfer<P>) => G,
        ): Component<P, Effect.Effect.Success<Effect.Effect.AsEffect<G>>, Effect.Effect.Error<G>, Effect.Effect.Context<G>>
        <Eff extends Utils.YieldWrap<Effect.Effect<any, any, any>>, A, B, C, D, E, F, G, H extends Effect.Effect<React.ReactNode, any, any>, P extends {} = {}>(
            body: (props: P) => Generator<Eff, A, never>,
            a: (
                _: Effect.Effect<
                    A,
                    [Eff] extends [never] ? never : [Eff] extends [Utils.YieldWrap<Effect.Effect<infer _A, infer E, infer _R>>] ? E : never,
                    [Eff] extends [never] ? never : [Eff] extends [Utils.YieldWrap<Effect.Effect<infer _A, infer _E, infer R>>] ? R : never
                >,
                props: NoInfer<P>,
            ) => B,
            b: (_: B, props: NoInfer<P>) => C,
            c: (_: C, props: NoInfer<P>) => D,
            d: (_: D, props: NoInfer<P>) => E,
            e: (_: E, props: NoInfer<P>) => F,
            f: (_: F, props: NoInfer<P>) => G,
            g: (_: G, props: NoInfer<P>) => H,
        ): Component<P, Effect.Effect.Success<Effect.Effect.AsEffect<H>>, Effect.Effect.Error<H>, Effect.Effect.Context<H>>
        <Eff extends Utils.YieldWrap<Effect.Effect<any, any, any>>, A, B, C, D, E, F, G, H, I extends Effect.Effect<React.ReactNode, any, any>, P extends {} = {}>(
            body: (props: P) => Generator<Eff, A, never>,
            a: (
                _: Effect.Effect<
                    A,
                    [Eff] extends [never] ? never : [Eff] extends [Utils.YieldWrap<Effect.Effect<infer _A, infer E, infer _R>>] ? E : never,
                    [Eff] extends [never] ? never : [Eff] extends [Utils.YieldWrap<Effect.Effect<infer _A, infer _E, infer R>>] ? R : never
                >,
                props: NoInfer<P>,
            ) => B,
            b: (_: B, props: NoInfer<P>) => C,
            c: (_: C, props: NoInfer<P>) => D,
            d: (_: D, props: NoInfer<P>) => E,
            e: (_: E, props: NoInfer<P>) => F,
            f: (_: F, props: NoInfer<P>) => G,
            g: (_: G, props: NoInfer<P>) => H,
            h: (_: H, props: NoInfer<P>) => I,
        ): Component<P, Effect.Effect.Success<Effect.Effect.AsEffect<I>>, Effect.Effect.Error<I>, Effect.Effect.Context<I>>
        <Eff extends Utils.YieldWrap<Effect.Effect<any, any, any>>, A, B, C, D, E, F, G, H, I, J extends Effect.Effect<React.ReactNode, any, any>, P extends {} = {}>(
            body: (props: P) => Generator<Eff, A, never>,
            a: (
                _: Effect.Effect<
                    A,
                    [Eff] extends [never] ? never : [Eff] extends [Utils.YieldWrap<Effect.Effect<infer _A, infer E, infer _R>>] ? E : never,
                    [Eff] extends [never] ? never : [Eff] extends [Utils.YieldWrap<Effect.Effect<infer _A, infer _E, infer R>>] ? R : never
                >,
                props: NoInfer<P>,
            ) => B,
            b: (_: B, props: NoInfer<P>) => C,
            c: (_: C, props: NoInfer<P>) => D,
            d: (_: D, props: NoInfer<P>) => E,
            e: (_: E, props: NoInfer<P>) => F,
            f: (_: F, props: NoInfer<P>) => G,
            g: (_: G, props: NoInfer<P>) => H,
            h: (_: H, props: NoInfer<P>) => I,
            i: (_: I, props: NoInfer<P>) => J,
        ): Component<P, Effect.Effect.Success<Effect.Effect.AsEffect<J>>, Effect.Effect.Error<J>, Effect.Effect.Context<J>>
    }

    export type NonGen = {
        <Eff extends Effect.Effect<React.ReactNode, any, any>, P extends {} = {}>(
            body: (props: P) => Eff
        ): Component<P, Effect.Effect.Success<Effect.Effect.AsEffect<Eff>>, Effect.Effect.Error<Eff>, Effect.Effect.Context<Eff>>
        <Eff extends Effect.Effect<React.ReactNode, any, any>, A, P extends {} = {}>(
            body: (props: P) => A,
            a: (_: A, props: NoInfer<P>) => Eff,
        ): Component<P, Effect.Effect.Success<Effect.Effect.AsEffect<Eff>>, Effect.Effect.Error<Eff>, Effect.Effect.Context<Eff>>
        <Eff extends Effect.Effect<React.ReactNode, any, any>, A, B, P extends {} = {}>(
            body: (props: P) => A,
            a: (_: A, props: NoInfer<P>) => B,
            b: (_: B, props: NoInfer<P>) => Eff,
        ): Component<P, Effect.Effect.Success<Effect.Effect.AsEffect<Eff>>, Effect.Effect.Error<Eff>, Effect.Effect.Context<Eff>>
        <Eff extends Effect.Effect<React.ReactNode, any, any>, A, B, C, P extends {} = {}>(
            body: (props: P) => A,
            a: (_: A, props: NoInfer<P>) => B,
            b: (_: B, props: NoInfer<P>) => C,
            c: (_: C, props: NoInfer<P>) => Eff,
        ): Component<P, Effect.Effect.Success<Effect.Effect.AsEffect<Eff>>, Effect.Effect.Error<Eff>, Effect.Effect.Context<Eff>>
        <Eff extends Effect.Effect<React.ReactNode, any, any>, A, B, C, D, P extends {} = {}>(
            body: (props: P) => A,
            a: (_: A, props: NoInfer<P>) => B,
            b: (_: B, props: NoInfer<P>) => C,
            c: (_: C, props: NoInfer<P>) => D,
            d: (_: D, props: NoInfer<P>) => Eff,
        ): Component<P, Effect.Effect.Success<Effect.Effect.AsEffect<Eff>>, Effect.Effect.Error<Eff>, Effect.Effect.Context<Eff>>
        <Eff extends Effect.Effect<React.ReactNode, any, any>, A, B, C, D, E, P extends {} = {}>(
            body: (props: P) => A,
            a: (_: A, props: NoInfer<P>) => B,
            b: (_: B, props: NoInfer<P>) => C,
            c: (_: C, props: NoInfer<P>) => D,
            d: (_: D, props: NoInfer<P>) => E,
            e: (_: E, props: NoInfer<P>) => Eff,
        ): Component<P, Effect.Effect.Success<Effect.Effect.AsEffect<Eff>>, Effect.Effect.Error<Eff>, Effect.Effect.Context<Eff>>
        <Eff extends Effect.Effect<React.ReactNode, any, any>, A, B, C, D, E, F, P extends {} = {}>(
            body: (props: P) => A,
            a: (_: A, props: NoInfer<P>) => B,
            b: (_: B, props: NoInfer<P>) => C,
            c: (_: C, props: NoInfer<P>) => D,
            d: (_: D, props: NoInfer<P>) => E,
            e: (_: E, props: NoInfer<P>) => F,
            f: (_: F, props: NoInfer<P>) => Eff,
        ): Component<P, Effect.Effect.Success<Effect.Effect.AsEffect<Eff>>, Effect.Effect.Error<Eff>, Effect.Effect.Context<Eff>>
        <Eff extends Effect.Effect<React.ReactNode, any, any>, A, B, C, D, E, F, G, P extends {} = {}>(
            body: (props: P) => A,
            a: (_: A, props: NoInfer<P>) => B,
            b: (_: B, props: NoInfer<P>) => C,
            c: (_: C, props: NoInfer<P>) => D,
            d: (_: D, props: NoInfer<P>) => E,
            e: (_: E, props: NoInfer<P>) => F,
            f: (_: F, props: NoInfer<P>) => G,
            g: (_: G, props: NoInfer<P>) => Eff,
        ): Component<P, Effect.Effect.Success<Effect.Effect.AsEffect<Eff>>, Effect.Effect.Error<Eff>, Effect.Effect.Context<Eff>>
        <Eff extends Effect.Effect<React.ReactNode, any, any>, A, B, C, D, E, F, G, H, P extends {} = {}>(
            body: (props: P) => A,
            a: (_: A, props: NoInfer<P>) => B,
            b: (_: B, props: NoInfer<P>) => C,
            c: (_: C, props: NoInfer<P>) => D,
            d: (_: D, props: NoInfer<P>) => E,
            e: (_: E, props: NoInfer<P>) => F,
            f: (_: F, props: NoInfer<P>) => G,
            g: (_: G, props: NoInfer<P>) => H,
            h: (_: H, props: NoInfer<P>) => Eff,
        ): Component<P, Effect.Effect.Success<Effect.Effect.AsEffect<Eff>>, Effect.Effect.Error<Eff>, Effect.Effect.Context<Eff>>
        <Eff extends Effect.Effect<React.ReactNode, any, any>, A, B, C, D, E, F, G, H, I, P extends {} = {}>(
            body: (props: P) => A,
            a: (_: A, props: NoInfer<P>) => B,
            b: (_: B, props: NoInfer<P>) => C,
            c: (_: C, props: NoInfer<P>) => D,
            d: (_: D, props: NoInfer<P>) => E,
            e: (_: E, props: NoInfer<P>) => F,
            f: (_: F, props: NoInfer<P>) => G,
            g: (_: G, props: NoInfer<P>) => H,
            h: (_: H, props: NoInfer<P>) => I,
            i: (_: I, props: NoInfer<P>) => Eff,
        ): Component<P, Effect.Effect.Success<Effect.Effect.AsEffect<Eff>>, Effect.Effect.Error<Eff>, Effect.Effect.Context<Eff>>
    }
}

/**
 * Creates an Effect-FC Component following the same overloads and pipeline style as `Effect.fn`.
 *
 * This is the **recommended** way to define components. It supports:
 * - Generator syntax (yield* style) — most ergonomic and readable
 * - Direct Effect return (non-generator)
 * - Chained transformation functions (like Effect.fn pipelines)
 * - Optional tracing span with automatic `displayName`
 *
 * When you provide a `spanName` as the first argument, two things happen automatically:
 * 1. A tracing span is created with that name (unless using `makeUntraced`)
 * 2. The resulting React component gets `displayName = spanName`
 */
export const make: (
    & make.Gen
    & make.NonGen
    & ((
        spanName: string,
        spanOptions?: Tracer.SpanOptions,
    ) => make.Gen & make.NonGen)
) = (spanNameOrBody: Function | string, ...pipeables: any[]): any => {
    if (typeof spanNameOrBody !== "string") {
        return Object.setPrototypeOf(
            Object.assign(function() {}, defaultOptions, {
                body: Effect.fn(spanNameOrBody as any, ...pipeables),
            }),
            ComponentProto,
        )
    }
    else {
        const spanOptions = pipeables[0]
        return (body: any, ...pipeables: any[]) => Object.setPrototypeOf(
            Object.assign(function() {}, defaultOptions, {
                body: Effect.fn(spanNameOrBody, spanOptions)(body, ...pipeables as []),
                displayName: spanNameOrBody,
            }),
            ComponentProto,
        )
    }
}

/**
 * Same as `make`, but creates an **untraced** version — no automatic tracing span is created.
 *
 * Follows the exact same API shape as `Effect.fnUntraced`.
 * Useful for:
 * - Components where you want full manual control over tracing
 * - Avoiding span noise in deeply nested UI
 *
 * When a string is provided as first argument, it is **only** used as the React component's `displayName`
 * (no tracing span is created).
 */
export const makeUntraced: (
    & make.Gen
    & make.NonGen
    & ((name: string) => make.Gen & make.NonGen)
) = (spanNameOrBody: Function | string, ...pipeables: any[]): any => (
    typeof spanNameOrBody !== "string"
        ? Object.setPrototypeOf(
            Object.assign(function() {}, defaultOptions, {
                body: Effect.fnUntraced(spanNameOrBody as any, ...pipeables as []),
            }),
            ComponentProto,
        )
        : (body: any, ...pipeables: any[]) => Object.setPrototypeOf(
            Object.assign(function() {}, defaultOptions, {
                body: Effect.fnUntraced(body, ...pipeables as []),
                displayName: spanNameOrBody,
            }),
            ComponentProto,
        )
)

/**
 * Creates a new component with modified options while preserving original behavior.
 */
export const withOptions: {
    <T extends Component<any, any, any, any>>(
        options: Partial<Component.Options>
    ): (self: T) => T
    <T extends Component<any, any, any, any>>(
        self: T,
        options: Partial<Component.Options>,
    ): T
} = Function.dual(2, <T extends Component<any, any, any, any>>(
    self: T,
    options: Partial<Component.Options>,
): T => Object.setPrototypeOf(
    Object.assign(function() {}, self, options),
    Object.getPrototypeOf(self),
))

/**
 * Wraps an Effect-FC `Component` and turns it into a regular React function component
 * that serves as an **entrypoint** into an Effect-FC component hierarchy.
 *
 * This is the recommended way to connect Effect-FC components to the rest of your React app,
 * especially when using routers (TanStack Router, React Router, etc.), lazy-loaded routes,
 * or any place where a standard React component is expected.
 *
 * The runtime is obtained from the provided React Context, allowing you to:
 * - Provide dependencies once at a high level
 * - Use the same runtime across an entire route tree or feature
 *
 * @example Using TanStack Router
 * ```tsx
 * // Main
 * export const runtime = ReactRuntime.make(Layer.empty)
 * function App() {
 *   return (
 *     <ReactRuntime.Provider runtime={runtime}>
 *       <RouterProvider router={router} />
 *     </ReactRuntime.Provider>
 *   )
 * }
 *
 * // Route
 * export const Route = createFileRoute("/")({
 *   component: Component.withRuntime(HomePage, runtime.context)
 * })
 * ```
 *
 * @param self    - The Effect-FC Component you want to render as a regular React component.
 * @param context - React Context that holds the Runtime to use for this component tree. See the `ReactRuntime` module to create one.
 */
export const withRuntime: {
    <P extends {}, A extends React.ReactNode, E, R>(
        context: React.Context<Runtime.Runtime<R>>,
    ): (self: Component<P, A, E, Scope.Scope | NoInfer<R>>) => (props: P) => A
    <P extends {}, A extends React.ReactNode, E, R>(
        self: Component<P, A, E, Scope.Scope | NoInfer<R>>,
        context: React.Context<Runtime.Runtime<R>>,
    ): (props: P) => A
} = Function.dual(2, <P extends {}, A extends React.ReactNode, E, R>(
    self: Component<P, A, E, R>,
    context: React.Context<Runtime.Runtime<R>>,
) => function WithRuntime(props: P) {
    return React.createElement(
        Runtime.runSync(React.useContext(context))(self),
        props,
    )
})


/**
 * Service that keeps track of scopes associated with React components
 * (used internally by the `useScope` hook).
 */
export class ScopeMap extends Effect.Service<ScopeMap>()("@effect-fc/Component/ScopeMap", {
    effect: Effect.bind(Effect.Do, "ref", () => Ref.make(HashMap.empty<object, ScopeMap.Entry>()))
}) {}

export declare namespace ScopeMap {
    export interface Entry {
        readonly scope: Scope.CloseableScope
        readonly closeFiber: Option.Option<Fiber.RuntimeFiber<void>>
    }
}


export declare namespace useScope {
    export interface Options {
        readonly finalizerExecutionStrategy?: ExecutionStrategy.ExecutionStrategy
        readonly finalizerExecutionDebounce?: Duration.DurationInput
    }
}

/**
 * Hook that creates and manages a `Scope` for the current component instance.
 *
 * Automatically closes the scope whenever `deps` changes or the component unmounts.
 *
 * @param deps - dependency array like in `React.useEffect`
 * @param options - finalizer execution control
 */
export const useScope = Effect.fnUntraced(function*(
    deps: React.DependencyList,
    options?: useScope.Options,
): Effect.fn.Return<Scope.Scope> {
    // biome-ignore lint/style/noNonNullAssertion: context initialization
    const runtimeRef = React.useRef<Runtime.Runtime<never>>(null!)
    runtimeRef.current = yield* Effect.runtime()

    const { key, scope } = React.useMemo(() => Runtime.runSync(runtimeRef.current)(Effect.Do.pipe(
        Effect.bind("scopeMapRef", () => Effect.map(
            ScopeMap as unknown as Effect.Effect<ScopeMap>,
            scopeMap => scopeMap.ref,
        )),
        Effect.let("key", () => ({})),
        Effect.bind("scope", () => Scope.make(options?.finalizerExecutionStrategy ?? defaultOptions.finalizerExecutionStrategy)),
        Effect.tap(({ scopeMapRef, key, scope }) =>
            Ref.update(scopeMapRef, HashMap.set(key, {
                scope,
                closeFiber: Option.none(),
            }))
        ),
    // biome-ignore lint/correctness/useExhaustiveDependencies: use of React.DependencyList
    )), deps)

    // biome-ignore lint/correctness/useExhaustiveDependencies: only reactive on "key"
    React.useEffect(() => Runtime.runSync(runtimeRef.current)((ScopeMap as unknown as Effect.Effect<ScopeMap>).pipe(
        Effect.map(scopeMap => scopeMap.ref),
        Effect.tap(ref => ref.pipe(
            Effect.andThen(HashMap.get(key)),
            Effect.andThen(entry => Option.match(entry.closeFiber, {
                onSome: Fiber.interruptFork,
                onNone: () => Effect.void,
            })),
        )),
        Effect.map(ref =>
            () => Runtime.runSync(runtimeRef.current)(Effect.andThen(
                Effect.sleep(options?.finalizerExecutionDebounce ?? defaultOptions.finalizerExecutionDebounce).pipe(
                    Effect.andThen(Scope.close(scope, Exit.void)),
                    Effect.onExit(() => Ref.update(ref, HashMap.remove(key))),
                    Effect.forkDaemon,
                ),
                fiber => Ref.update(ref, HashMap.set(key, {
                    scope,
                    closeFiber: Option.some(fiber),
                })),
            ))
        ),
    )), [key])

    return scope
})

/**
 * Runs an effect and returns its result only once on component mount.
 */
export const useOnMount = Effect.fnUntraced(function* <A, E, R>(
    f: () => Effect.Effect<A, E, R>
): Effect.fn.Return<A, E, R> {
    const runtime = yield* Effect.runtime<R>()
    return yield* React.useState(() => Runtime.runSync(runtime)(Effect.cached(f())))[0]
})

export declare namespace useOnChange {
    export interface Options extends useScope.Options {}
}

/**
 * Runs an effect and returns its result whenever dependencies change.
 *
 * Provides its own `Scope` which closes whenever `deps` changes or the component unmounts.
 */
export const useOnChange = Effect.fnUntraced(function* <A, E, R>(
    f: () => Effect.Effect<A, E, R>,
    deps: React.DependencyList,
    options?: useOnChange.Options,
): Effect.fn.Return<A, E, Exclude<R, Scope.Scope>> {
    const runtime = yield* Effect.runtime<Exclude<R, Scope.Scope>>()
    const scope = yield* useScope(deps, options)

    // biome-ignore lint/correctness/useExhaustiveDependencies: only reactive on "scope"
    return yield* React.useMemo(() => Runtime.runSync(runtime)(
        Effect.cached(Effect.provideService(f(), Scope.Scope, scope))
    ), [scope])
})

export declare namespace useReactEffect {
    export interface Options {
        readonly finalizerExecutionMode?: "sync" | "fork"
        readonly finalizerExecutionStrategy?: ExecutionStrategy.ExecutionStrategy
    }
}

/**
 * Like `React.useEffect` but accepts an effect.
 *
 * Cleanup logic is handled through the `Scope` API rather than using imperative cleanup.
 */
export const useReactEffect = Effect.fnUntraced(function* <E, R>(
    f: () => Effect.Effect<void, E, R>,
    deps?: React.DependencyList,
    options?: useReactEffect.Options,
): Effect.fn.Return<void, never, Exclude<R, Scope.Scope>> {
    const runtime = yield* Effect.runtime<Exclude<R, Scope.Scope>>()
    // biome-ignore lint/correctness/useExhaustiveDependencies: use of React.DependencyList
    React.useEffect(() => runReactEffect(runtime, f, options), deps)
})

const runReactEffect = <E, R>(
    runtime: Runtime.Runtime<Exclude<R, Scope.Scope>>,
    f: () => Effect.Effect<void, E, R>,
    options?: useReactEffect.Options,
) => Effect.Do.pipe(
    Effect.bind("scope", () => Scope.make(options?.finalizerExecutionStrategy ?? defaultOptions.finalizerExecutionStrategy)),
    Effect.bind("exit", ({ scope }) => Effect.exit(Effect.provideService(f(), Scope.Scope, scope))),
    Effect.map(({ scope }) =>
        () => {
            switch (options?.finalizerExecutionMode ?? "fork") {
                case "sync":
                    Runtime.runSync(runtime)(Scope.close(scope, Exit.void))
                    break
                case "fork":
                    Runtime.runFork(runtime)(Scope.close(scope, Exit.void))
                    break
            }
        }
    ),
    Runtime.runSync(runtime),
)

export declare namespace useReactLayoutEffect {
    export interface Options extends useReactEffect.Options {}
}

/**
 * Like `React.useReactLayoutEffect` but accepts an effect.
 *
 * Cleanup logic is handled through the `Scope` API rather than using imperative cleanup.
 */
export const useReactLayoutEffect = Effect.fnUntraced(function* <E, R>(
    f: () => Effect.Effect<void, E, R>,
    deps?: React.DependencyList,
    options?: useReactLayoutEffect.Options,
): Effect.fn.Return<void, never, Exclude<R, Scope.Scope>> {
    const runtime = yield* Effect.runtime<Exclude<R, Scope.Scope>>()
    // biome-ignore lint/correctness/useExhaustiveDependencies: use of React.DependencyList
    React.useLayoutEffect(() => runReactEffect(runtime, f, options), deps)
})

/**
 * Get a synchronous run function for the current runtime context.
 */
export const useRunSync = <R = never>(): Effect.Effect<
    <A, E = never>(effect: Effect.Effect<A, E, Scope.Scope | R>) => A,
    never,
    Scope.Scope | R
> => Effect.andThen(Effect.runtime(), Runtime.runSync)

/**
 * Get a Promise-based run function for the current runtime context.
 */
export const useRunPromise = <R = never>(): Effect.Effect<
    <A, E = never>(effect: Effect.Effect<A, E, Scope.Scope | R>) => Promise<A>,
    never,
    Scope.Scope | R
> => Effect.andThen(Effect.runtime(), context => Runtime.runPromise(context))

/**
 * Turns a function returning an effect into a memoized synchronous function.
 */
export const useCallbackSync = Effect.fnUntraced(function* <Args extends unknown[], A, E, R>(
    f: (...args: Args) => Effect.Effect<A, E, R>,
    deps: React.DependencyList,
): Effect.fn.Return<(...args: Args) => A, never, R> {
    // biome-ignore lint/style/noNonNullAssertion: context initialization
    const runtimeRef = React.useRef<Runtime.Runtime<R>>(null!)
    runtimeRef.current = yield* Effect.runtime<R>()

    // biome-ignore lint/correctness/useExhaustiveDependencies: use of React.DependencyList
    return React.useCallback((...args: Args) => Runtime.runSync(runtimeRef.current)(f(...args)), deps)
})

/**
 * Turns a function returning an effect into a memoized Promise-based asynchronous function.
 */
export const useCallbackPromise = Effect.fnUntraced(function* <Args extends unknown[], A, E, R>(
    f: (...args: Args) => Effect.Effect<A, E, R>,
    deps: React.DependencyList,
): Effect.fn.Return<(...args: Args) => Promise<A>, never, R> {
    // biome-ignore lint/style/noNonNullAssertion: context initialization
    const runtimeRef = React.useRef<Runtime.Runtime<R>>(null!)
    runtimeRef.current = yield* Effect.runtime<R>()

    // biome-ignore lint/correctness/useExhaustiveDependencies: use of React.DependencyList
    return React.useCallback((...args: Args) => Runtime.runPromise(runtimeRef.current)(f(...args)), deps)
})

export declare namespace useContext {
    export interface Options extends useOnChange.Options {}
}

/**
 * Hook that constructs a layer and returns the created context.
 *
 * The layer gets reconstructed everytime `layer` changes, so make sure its value is stable.
 *
 * Building a layer containing asynchronous effects require the component calling this hook to be made async using `Async.async`.
 */
export const useContext = <ROut, E, RIn>(
    layer: Layer.Layer<ROut, E, RIn>,
    options?: useContext.Options,
): Effect.Effect<Context.Context<ROut>, E, Exclude<RIn, Scope.Scope>> => useOnChange(() => Effect.context<RIn>().pipe(
    Effect.map(context => ManagedRuntime.make(Layer.provide(layer, Layer.succeedContext(context)))),
    Effect.tap(runtime => Effect.addFinalizer(() => runtime.disposeEffect)),
    Effect.andThen(runtime => runtime.runtimeEffect),
    Effect.andThen(runtime => runtime.context),
), [layer], options)
