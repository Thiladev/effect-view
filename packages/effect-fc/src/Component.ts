/** biome-ignore-all lint/complexity/noBannedTypes: {} is the default type for React props */
/** biome-ignore-all lint/complexity/useArrowFunction: necessary for class prototypes */
import { Context, type Duration, Effect, Equivalence, ExecutionStrategy, Exit, Fiber, Function, HashMap, identity, Layer, ManagedRuntime, Option, Pipeable, Predicate, Ref, Runtime, Scope, Tracer, type Utils } from "effect"
import * as React from "react"


export const ComponentTypeId: unique symbol = Symbol.for("@effect-fc/Component/Component")
export type ComponentTypeId = typeof ComponentTypeId

/**
 * Represents an Effect-based React Component that integrates the Effect system with React.
 */
export interface Component<P extends {}, A extends React.ReactNode, E, R, F extends Component.Signature>
extends ComponentPrototype<R, F>, ComponentOptions {
    new(_: never): Record<string, never>
    readonly [ComponentTypeId]: ComponentTypeId
    readonly "~Props": P
    readonly "~Success": A
    readonly "~Error": E
    readonly "~Context": R
    readonly "~Function": F

    readonly body: (props: P) => Effect.Effect<A, E, R>
}

export declare namespace Component {
    export type Default<P extends {}, A extends React.ReactNode, E, R> = Component<P, A, E, R, DefaultSignature<P, A>>
    export type Any = Component<any, any, any, any, any>

    export type Signature = (props: any) => React.ReactNode
    export type DefaultSignature<P extends {}, A extends React.ReactNode> = (props: P) => A

    export type Props<T extends Any> = [T] extends [Component<infer P, infer _A, infer _E, infer _R, infer _F>] ? P : never
    export type Success<T extends Any> = [T] extends [Component<infer _P, infer A, infer _E, infer _R, infer _F>] ? A : never
    export type Error<T extends Any> = [T] extends [Component<infer _P, infer _A, infer E, infer _R, infer _F>] ? E : never
    export type Context<T extends Any> = [T] extends [Component<infer _P, infer _A, infer _E, infer R, infer _F>] ? R : never
    export type Function<T extends Any> = [T] extends [Component<infer _P, infer _A, infer _E, infer _R, infer F>] ? F : never

    export type AsComponent<T extends Any> = Component<Props<T>, Success<T>, Error<T>, Context<T>, Function<T>>
}


export interface ComponentImpl<P extends {}, A extends React.ReactNode, E, R, F extends Component.Signature>
extends Component<P, A, E, R, F>, ComponentImplPrototype<R, F> {}

export interface ComponentImplPrototype<R, F extends Component.Signature> {
    readonly use: Effect.Effect<F, never, Exclude<R, Scope.Scope>>

    asFunctionComponent(runtimeRef: React.Ref<Runtime.Runtime<Exclude<R, Scope.Scope>>>): F
    setFunctionComponentName(f: F): void
    transformFunctionComponent(f: F): F
}

export const ComponentImplPrototype: ComponentImplPrototype<any, any> = Object.freeze({
    get use() { return use(this) },

    asFunctionComponent<P extends {}, A extends React.ReactNode, E, R, F extends Component.Signature>(
        this: ComponentImpl<P, A, E, R, F>,
        runtimeRef: React.RefObject<Runtime.Runtime<Exclude<R, Scope.Scope>>>,
    ) {
        return (props: P) => Runtime.runSync(runtimeRef.current)(
            Effect.andThen(
                useScope([], this),
                scope => Effect.provideService(this.body(props), Scope.Scope, scope),
            )
        )
    },

    setFunctionComponentName<P extends {}, A extends React.ReactNode, E, R, F extends Component.Signature>(
        this: ComponentImpl<P, A, E, R, F>,
        f: React.FC<P>,
    ) {
        f.displayName = this.displayName ?? "Anonymous"
    },

    transformFunctionComponent: identity,
} as const)

const use = Effect.fnUntraced(function* <P extends {}, A extends React.ReactNode, E, R, F extends Component.Signature>(
    self: ComponentImpl<P, A, E, R, F>
) {
    // biome-ignore lint/style/noNonNullAssertion: React ref initialization
    const runtimeRef = React.useRef<Runtime.Runtime<Exclude<R, Scope.Scope>>>(null!)
    runtimeRef.current = yield* Effect.runtime<Exclude<R, Scope.Scope>>()

    return yield* React.useState(() => Runtime.runSync(runtimeRef.current)(Effect.cachedFunction(
        (_services: readonly any[]) => Effect.sync(() => {
            const f = self.asFunctionComponent(runtimeRef)
            self.setFunctionComponentName(f)
            return self.transformFunctionComponent(f)
        }),
        Equivalence.array(Equivalence.strict()),
    )))[0](Array.from(
        Context.omit(...self.nonReactiveTags)(runtimeRef.current.context).unsafeMap.values()
    ))
})


export interface ComponentPrototype<R, F extends Component.Signature>
extends Pipeable.Pipeable {
    readonly [ComponentTypeId]: ComponentTypeId
    readonly use: Effect.Effect<F, never, Exclude<R, Scope.Scope>>
}

export const ComponentPrototype: ComponentPrototype<any, any> = Object.freeze(
    Object.defineProperties(
        {
            [ComponentTypeId]: ComponentTypeId,
            ...Pipeable.Prototype,
        },
        Object.getOwnPropertyDescriptors(ComponentImplPrototype),
    ) as ComponentPrototype<any, any>
)


export interface ComponentOptions {
    /**
     * Custom display name for the component in React DevTools and debugging utilities.
     */
    readonly displayName?: string

    /**
     * Context tags that should not trigger component remount when their values change.
     *
     * @default [Tracer.ParentSpan]
     */
    readonly nonReactiveTags: readonly Context.Tag<any, any>[]

    /**
     * Specifies the execution strategy for finalizers when the component unmounts or its scope closes.
     * Determines whether finalizers execute sequentially or in parallel.
     *
     * @default ExecutionStrategy.sequential
     */
    readonly finalizerExecutionStrategy: ExecutionStrategy.ExecutionStrategy

    /**
     * Debounce duration before executing finalizers after component unmount.
     * Prevents unnecessary cleanup work during rapid remount/unmount cycles,
     * which is common in development and certain UI patterns.
     *
     * @default "100 millis"
     */
    readonly finalizerExecutionDebounce: Duration.DurationInput
}

export const defaultOptions: ComponentOptions = {
    nonReactiveTags: [Tracer.ParentSpan],
    finalizerExecutionStrategy: ExecutionStrategy.sequential,
    finalizerExecutionDebounce: "100 millis",
}


export const isComponent = (u: unknown): u is Component.Default<{}, React.ReactNode, unknown, unknown> => Predicate.hasProperty(u, ComponentTypeId)

export declare namespace make {
    export type Gen = {
        <Eff extends Utils.YieldWrap<Effect.Effect<any, any, any>>, A extends React.ReactNode, P extends {} = {}>(
            body: (props: P) => Generator<Eff, A, never>
        ): Component.Default<
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
        ): Component.Default<P, Effect.Effect.Success<Effect.Effect.AsEffect<B>>, Effect.Effect.Error<B>, Effect.Effect.Context<B>>
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
        ): Component.Default<P, Effect.Effect.Success<Effect.Effect.AsEffect<C>>, Effect.Effect.Error<C>, Effect.Effect.Context<C>>
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
        ): Component.Default<P, Effect.Effect.Success<Effect.Effect.AsEffect<D>>, Effect.Effect.Error<D>, Effect.Effect.Context<D>>
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
        ): Component.Default<P, Effect.Effect.Success<Effect.Effect.AsEffect<E>>, Effect.Effect.Error<E>, Effect.Effect.Context<E>>
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
        ): Component.Default<P, Effect.Effect.Success<Effect.Effect.AsEffect<F>>, Effect.Effect.Error<F>, Effect.Effect.Context<F>>
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
        ): Component.Default<P, Effect.Effect.Success<Effect.Effect.AsEffect<G>>, Effect.Effect.Error<G>, Effect.Effect.Context<G>>
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
        ): Component.Default<P, Effect.Effect.Success<Effect.Effect.AsEffect<H>>, Effect.Effect.Error<H>, Effect.Effect.Context<H>>
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
        ): Component.Default<P, Effect.Effect.Success<Effect.Effect.AsEffect<I>>, Effect.Effect.Error<I>, Effect.Effect.Context<I>>
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
        ): Component.Default<P, Effect.Effect.Success<Effect.Effect.AsEffect<J>>, Effect.Effect.Error<J>, Effect.Effect.Context<J>>
    }

    export type NonGen = {
        <Eff extends Effect.Effect<React.ReactNode, any, any>, P extends {} = {}>(
            body: (props: P) => Eff
        ): Component.Default<P, Effect.Effect.Success<Effect.Effect.AsEffect<Eff>>, Effect.Effect.Error<Eff>, Effect.Effect.Context<Eff>>
        <Eff extends Effect.Effect<React.ReactNode, any, any>, A, P extends {} = {}>(
            body: (props: P) => A,
            a: (_: A, props: NoInfer<P>) => Eff,
        ): Component.Default<P, Effect.Effect.Success<Effect.Effect.AsEffect<Eff>>, Effect.Effect.Error<Eff>, Effect.Effect.Context<Eff>>
        <Eff extends Effect.Effect<React.ReactNode, any, any>, A, B, P extends {} = {}>(
            body: (props: P) => A,
            a: (_: A, props: NoInfer<P>) => B,
            b: (_: B, props: NoInfer<P>) => Eff,
        ): Component.Default<P, Effect.Effect.Success<Effect.Effect.AsEffect<Eff>>, Effect.Effect.Error<Eff>, Effect.Effect.Context<Eff>>
        <Eff extends Effect.Effect<React.ReactNode, any, any>, A, B, C, P extends {} = {}>(
            body: (props: P) => A,
            a: (_: A, props: NoInfer<P>) => B,
            b: (_: B, props: NoInfer<P>) => C,
            c: (_: C, props: NoInfer<P>) => Eff,
        ): Component.Default<P, Effect.Effect.Success<Effect.Effect.AsEffect<Eff>>, Effect.Effect.Error<Eff>, Effect.Effect.Context<Eff>>
        <Eff extends Effect.Effect<React.ReactNode, any, any>, A, B, C, D, P extends {} = {}>(
            body: (props: P) => A,
            a: (_: A, props: NoInfer<P>) => B,
            b: (_: B, props: NoInfer<P>) => C,
            c: (_: C, props: NoInfer<P>) => D,
            d: (_: D, props: NoInfer<P>) => Eff,
        ): Component.Default<P, Effect.Effect.Success<Effect.Effect.AsEffect<Eff>>, Effect.Effect.Error<Eff>, Effect.Effect.Context<Eff>>
        <Eff extends Effect.Effect<React.ReactNode, any, any>, A, B, C, D, E, P extends {} = {}>(
            body: (props: P) => A,
            a: (_: A, props: NoInfer<P>) => B,
            b: (_: B, props: NoInfer<P>) => C,
            c: (_: C, props: NoInfer<P>) => D,
            d: (_: D, props: NoInfer<P>) => E,
            e: (_: E, props: NoInfer<P>) => Eff,
        ): Component.Default<P, Effect.Effect.Success<Effect.Effect.AsEffect<Eff>>, Effect.Effect.Error<Eff>, Effect.Effect.Context<Eff>>
        <Eff extends Effect.Effect<React.ReactNode, any, any>, A, B, C, D, E, F, P extends {} = {}>(
            body: (props: P) => A,
            a: (_: A, props: NoInfer<P>) => B,
            b: (_: B, props: NoInfer<P>) => C,
            c: (_: C, props: NoInfer<P>) => D,
            d: (_: D, props: NoInfer<P>) => E,
            e: (_: E, props: NoInfer<P>) => F,
            f: (_: F, props: NoInfer<P>) => Eff,
        ): Component.Default<P, Effect.Effect.Success<Effect.Effect.AsEffect<Eff>>, Effect.Effect.Error<Eff>, Effect.Effect.Context<Eff>>
        <Eff extends Effect.Effect<React.ReactNode, any, any>, A, B, C, D, E, F, G, P extends {} = {}>(
            body: (props: P) => A,
            a: (_: A, props: NoInfer<P>) => B,
            b: (_: B, props: NoInfer<P>) => C,
            c: (_: C, props: NoInfer<P>) => D,
            d: (_: D, props: NoInfer<P>) => E,
            e: (_: E, props: NoInfer<P>) => F,
            f: (_: F, props: NoInfer<P>) => G,
            g: (_: G, props: NoInfer<P>) => Eff,
        ): Component.Default<P, Effect.Effect.Success<Effect.Effect.AsEffect<Eff>>, Effect.Effect.Error<Eff>, Effect.Effect.Context<Eff>>
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
        ): Component.Default<P, Effect.Effect.Success<Effect.Effect.AsEffect<Eff>>, Effect.Effect.Error<Eff>, Effect.Effect.Context<Eff>>
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
        ): Component.Default<P, Effect.Effect.Success<Effect.Effect.AsEffect<Eff>>, Effect.Effect.Error<Eff>, Effect.Effect.Context<Eff>>
    }
}

/**
 * Creates an Effect-FC Component using the same overloads and pipeline composition style as `Effect.fn`.
 *
 * This is the **recommended** approach for defining Effect-FC components. It provides comprehensive
 * support for multiple component definition patterns:
 *
 * - **Generator syntax** (yield* style): Most ergonomic and readable approach for sequential operations
 * - **Direct Effect return**: For simple components that return an Effect directly
 * - **Chained transformation functions**: Enables Effect.fn-style pipelines for composable transformations
 * - **Automatic tracing**: Optional tracing span creation with automatic `displayName` assignment
 *
 * When a `spanName` string is provided, the following occurs automatically:
 * 1. A distributed tracing span is created with the specified name
 * 2. The resulting React component receives `displayName = spanName` for DevTools visibility
 *
 * @example
 * ```tsx
 * const MyComponent = Component.make("MyComponent")(function* (props: { count: number }) {
 *   const value = yield* someEffect
 *   return <div>{value}</div>
 * })
 * ```
 *
 * @example As an opaque type using class syntax
 * ```tsx
 * class MyComponent extends Component.make("MyComponent")(function* (props: { count: number }) {
 *   const value = yield* someEffect
 *   return <div>{value}</div>
 * }) {}
 * ```
 *
 * @example Without name
 * ```tsx
 * class MyComponent extends Component.make(function* (props: { count: number }) {
 *   const value = yield* someEffect
 *   return <div>{value}</div>
 * }) {}
 * ```
 *
 * @example Using pipeline
 * ```tsx
 * class MyComponent extends Component.make("MyComponent")(
 *   (props: { count: number }) => someEffect,
 *   Effect.map(value => <div>{value}</div>),
 * ) {}
 * ```
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
            ComponentPrototype,
        )
    }
    else {
        const spanOptions = pipeables[0]
        return (body: any, ...pipeables: any[]) => Object.setPrototypeOf(
            Object.assign(function() {}, defaultOptions, {
                body: Effect.fn(spanNameOrBody, spanOptions)(body, ...pipeables as []),
                displayName: spanNameOrBody,
            }),
            ComponentPrototype,
        )
    }
}

/**
 * Creates an Effect-FC Component without automatic distributed tracing.
 *
 * This function provides the same API surface as `make`, but does not create automatic tracing spans.
 * It follows the exact same overload structure as `Effect.fnUntraced`.
 *
 * Use this variant when you need:
 * - Full manual control over tracing instrumentation
 * - To reduce tracing overhead in deeply nested component hierarchies
 * - To avoid span noise in performance-sensitive applications
 *
 * When a `spanName` string is provided, it is used **exclusively** as the React component's
 * `displayName` for DevTools identification. No tracing span is created.
 *
 * @example
 * ```tsx
 * const MyComponent = Component.makeUntraced("MyComponent")(function* (props: { count: number }) {
 *   const value = yield* someEffect
 *   return <div>{value}</div>
 * })
 * ```
 *
 * @example As an opaque type using class syntax
 * ```tsx
 * class MyComponent extends Component.makeUntraced("MyComponent")(function* (props: { count: number }) {
 *   const value = yield* someEffect
 *   return <div>{value}</div>
 * }) {}
 * ```
 *
 * @example Without name
 * ```tsx
 * class MyComponent extends Component.makeUntraced(function* (props: { count: number }) {
 *   const value = yield* someEffect
 *   return <div>{value}</div>
 * }) {}
 * ```
 *
 * @example Using pipeline
 * ```tsx
 * class MyComponent extends Component.makeUntraced("MyComponent")(
 *   (props: { count: number }) => someEffect,
 *   Effect.map(value => <div>{value}</div>),
 * ) {}
 * ```
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
            ComponentPrototype,
        )
        : (body: any, ...pipeables: any[]) => Object.setPrototypeOf(
            Object.assign(function() {}, defaultOptions, {
                body: Effect.fnUntraced(body, ...pipeables as []),
                displayName: spanNameOrBody,
            }),
            ComponentPrototype,
        )
)

export declare namespace withSignature {
    export type Result<T extends Component.Any, F extends Component.Signature> = (
        & Omit<T, keyof Component.AsComponent<T>>
        & Component<Component.Props<T>, Component.Success<T>, Component.Error<T>, Component.Context<T>, F>
    )
}

export const withSignature: {
    <F extends Component.Signature>(): <T extends Component.Any>(
        self: T
    ) => withSignature.Result<T, F>
    <F extends Component.Signature, T extends Component.Any>(
        self: T
    ): withSignature.Result<T, F>
} = (self?: Component.Any): any => self === undefined
    ? identity
    : self

/**
 * Creates a new component with modified configuration options while preserving all original behavior.
 *
 * This function allows you to customize component-level options such as finalizer execution strategy
 * and debounce timing.
 *
 * @example
 * ```tsx
 * const MyComponentWithCustomOptions = MyComponent.pipe(
 *   Component.withOptions({
 *     finalizerExecutionStrategy: ExecutionStrategy.parallel,
 *     finalizerExecutionDebounce: "50 millis",
 *   })
 * )
 * ```
 */
export const withOptions: {
    <T extends Component.Any>(
        options: Partial<ComponentOptions>
    ): (self: T) => T
    <T extends Component.Any>(
        self: T,
        options: Partial<ComponentOptions>,
    ): T
} = Function.dual(2, <T extends Component.Any>(
    self: T,
    options: Partial<ComponentOptions>,
): T => Object.setPrototypeOf(
    Object.assign(function() {}, self, options),
    Object.getPrototypeOf(self),
))

/**
 * Wraps an Effect-FC Component and converts it into a standard React function component,
 * serving as an **entrypoint** into an Effect-FC component hierarchy.
 *
 * This is how Effect-FC components are integrated with the broader React ecosystem,
 * particularly when:
 * - Using client-side routers (TanStack Router, React Router, etc.)
 * - Implementing lazy-loaded or code-split routes
 * - Connecting to third-party libraries expecting standard React components
 * - Creating component boundaries between Effect-FC and non-Effect-FC code
 *
 * The Effect runtime is obtained from the provided React Context.
 *
 * @param self    - The Effect-FC Component to be rendered as a standard React component
 * @param context - React Context providing the Effect Runtime for this component tree.
 *                  Create this using the `ReactRuntime` module.
 *
 * @example Integration with TanStack Router
 * ```tsx
 * // Application root
 * export const runtime = ReactRuntime.make(Layer.empty)
 *
 * function App() {
 *   return (
 *     <ReactRuntime.Provider runtime={runtime}>
 *       <RouterProvider router={router} />
 *     </ReactRuntime.Provider>
 *   )
 * }
 *
 * // Route definition
 * export const Route = createFileRoute("/")({
 *   component: Component.withRuntime(HomePage, runtime.context)
 * })
 * ```
 *
 */
export const withRuntime: {
    <P extends {}, A extends React.ReactNode, E, R, F extends Component.Signature>(
        context: React.Context<Runtime.Runtime<R>>,
    ): (self: Component<P, A, E, Scope.Scope | NoInfer<R>, F>) => F
    <P extends {}, A extends React.ReactNode, E, R, F extends Component.Signature>(
        self: Component<P, A, E, Scope.Scope | NoInfer<R>, F>,
        context: React.Context<Runtime.Runtime<R>>,
    ): F
} = Function.dual(2, <P extends {}, A extends React.ReactNode, E, R, F extends Component.Signature>(
    self: Component<P, A, E, R, F>,
    context: React.Context<Runtime.Runtime<R>>,
) => function WithRuntime(props: P) {
    return React.createElement(
        Runtime.runSync(React.useContext(context))(self.use) as React.FC<P>,
        props,
    )
})


/**
 * Internal Effect service that maintains a registry of scopes associated with React component instances.
 *
 * This service is used internally by the `useScope` hook to manage the lifecycle of component scopes,
 * including tracking active scopes and coordinating their cleanup when components unmount or dependencies change.
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
 * Effect hook that creates and manages a `Scope` for the current component instance.
 *
 * This hook establishes a new scope that is automatically closed when:
 * - The component unmounts
 * - The dependency array `deps` changes
 *
 * The scope provides a resource management boundary for any Effects executed within the component,
 * ensuring proper cleanup of resources and execution of finalizers.
 *
 * @param deps     - Dependency array following React.useEffect semantics. The scope is recreated
 *                   whenever any dependency changes.
 * @param options  - Configuration for finalizer execution behavior, including execution strategy
 *                   and debounce timing.
 *
 * @returns An Effect that produces a `Scope` for resource management
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
 * Effect hook that executes an Effect once when the component mounts and caches the result.
 *
 * This hook is useful for one-time initialization logic that should not be re-executed
 * when the component re-renders. The Effect is executed exactly once during the component's
 * initial mount, and the cached result is returned on all subsequent renders.
 *
 * @param f - A function that returns the Effect to execute on mount
 *
 * @returns An Effect that produces the cached result of the Effect
 *
 * @example
 * ```tsx
 * const MyComponent = Component.make(function*() {
 *   const initialData = yield* Component.useOnMount(() => getData)
 *   return <div>{initialData}</div>
 * })
 * ```
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
 * Effect hook that executes an Effect whenever dependencies change and caches the result.
 *
 * This hook combines the dependency-tracking behavior of React.useEffect with Effect caching.
 * The Effect is re-executed whenever any dependency in the `deps` array changes, and the result
 * is cached until the next dependency change.
 *
 * A dedicated scope is created for each dependency change, ensuring proper resource cleanup:
 * - The scope closes when dependencies change
 * - The scope closes when the component unmounts
 * - All finalizers are executed according to the configured execution strategy
 *
 * @param f       - A function that returns the Effect to execute
 * @param deps    - Dependency array following React.useEffect semantics
 * @param options - Configuration for scope and finalizer behavior
 *
 * @returns An Effect that produces the cached result of the Effect
 *
 * @example
 * ```tsx
 * const MyComponent = Component.make(function* (props: { userId: string }) {
 *   const userData = yield* Component.useOnChange(
 *     getUser(props.userId),
 *     [props.userId],
 *   )
 *   return <div>{userData.name}</div>
 * })
 * ```
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
 * Effect hook that provides Effect-based semantics for React.useEffect.
 *
 * This hook bridges React's useEffect with the Effect system, allowing you to use Effects
 * for React side effects while maintaining React's dependency tracking and lifecycle semantics.
 *
 * Unlike React.useEffect which uses imperative cleanup functions, this hook leverages the
 * Effect Scope API for resource management. Cleanup logic is expressed declaratively through
 * finalizers registered with the scope, providing better composability and error handling.
 *
 * @param f       - A function that returns an Effect to execute as a side effect
 * @param deps    - Optional dependency array following React.useEffect semantics.
 *                  If omitted, the effect runs after every render.
 * @param options - Configuration for finalizer execution mode (sync or fork) and strategy
 *
 * @returns An Effect that produces void
 *
 * @example
 * ```tsx
 * const MyComponent = Component.make(function* (props: { id: string }) {
 *   yield* Component.useReactEffect(
 *     () => getNotificationStreamForUser(props.id).pipe(
 *       Stream.unwrap,
 *       Stream.runForEach(notification => Console.log(`Notification received: ${ notification }`),
 *       Effect.forkScoped,
 *     ),
 *     [props.id],
 *   )
 *   return <div>Subscribed to notifications for {props.id}</div>
 * })
 * ```
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
 * Effect hook that provides Effect-based semantics for React.useLayoutEffect.
 *
 * This hook is identical to `useReactEffect` but executes synchronously after DOM mutations
 * but before the browser paints, following React.useLayoutEffect semantics.
 *
 * Use this hook when you need to:
 * - Measure DOM elements (e.g., for layout calculations)
 * - Synchronously update state based on DOM measurements
 * - Avoid visual flicker from asynchronous updates
 *
 * Like `useReactEffect`, cleanup logic is handled through the Effect Scope API rather than
 * imperative cleanup functions, providing declarative and composable resource management.
 *
 * @param f       - A function that returns an Effect to execute as a layout side effect
 * @param deps    - Optional dependency array following React.useLayoutEffect semantics.
 *                  If omitted, the effect runs after every render.
 * @param options - Configuration for finalizer execution mode (sync or fork) and strategy
 *
 * @returns An Effect that produces void
 *
 * @example
 * ```tsx
 * const MyComponent = Component.make(function*() {
 *   const ref = React.useRef<HTMLDivElement>(null)
 *   yield* Component.useReactLayoutEffect(
 *     () => Effect.gen(function* () {
 *       const element = ref.current
 *       if (element) {
 *         const rect = element.getBoundingClientRect()
 *         yield* Console.log(`Element dimensions: ${ rect.width }x${ rect.height }`)
 *       }
 *     }),
 *     [],
 *   )
 *   return <div ref={ref}>Content</div>
 * })
 * ```
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
 * Effect hook that provides a synchronous function to execute Effects within the current runtime context.
 *
 * This hook returns a function that can execute Effects synchronously, blocking until completion.
 * Use this when you need to run Effects from non-Effect code (e.g., event handlers, callbacks)
 * within a component.
 *
 * @returns An Effect that produces a function capable of synchronously executing Effects
 *
 * @example
 * ```tsx
 * const MyComponent = Component.make(function*() {
 *   const runSync = yield* Component.useRunSync<SomeService>() // Specify required services
 *   const runSync = yield* Component.useRunSync() // Or no service requirements
 *
 *   return <button onClick={() => runSync(someEffect)}>Click me</button>
 * })
 * ```
 */
export const useRunSync = <R = never>(): Effect.Effect<
    <A, E = never>(effect: Effect.Effect<A, E, Scope.Scope | R>) => A,
    never,
    Scope.Scope | R
> => Effect.andThen(Effect.runtime(), Runtime.runSync)

/**
 * Effect hook that provides an asynchronous function to execute Effects within the current runtime context.
 *
 * This hook returns a function that executes Effects asynchronously, returning a Promise that resolves
 * with the Effect's result. Use this when you need to run Effects from non-Effect code (e.g., event handlers,
 * async callbacks) and want to handle the result asynchronously.
 *
 * @returns An Effect that produces a function capable of asynchronously executing Effects
 *
 * @example
 * ```tsx
 * const MyComponent = Component.make(function*() {
 *   const runPromise = yield* Component.useRunPromise<SomeService>() // Specify required services
 *   const runPromise = yield* Component.useRunPromise() // Or no service requirements
 *
 *   return <button onClick={() => runPromise(someEffect)}>Click me</button>
 * })
 * ```
 */
export const useRunPromise = <R = never>(): Effect.Effect<
    <A, E = never>(effect: Effect.Effect<A, E, Scope.Scope | R>) => Promise<A>,
    never,
    Scope.Scope | R
> => Effect.andThen(Effect.runtime(), context => Runtime.runPromise(context))

/**
 * Effect hook that memoizes a function that returns an Effect, providing synchronous execution.
 *
 * This hook wraps a function that returns an Effect and returns a memoized version that:
 * - Executes the Effect synchronously when called
 * - Is memoized based on the provided dependency array
 * - Maintains referential equality across renders when dependencies don't change
 *
 * Use this to create stable callback references for event handlers and other scenarios
 * where you need to execute Effects synchronously from non-Effect code.
 *
 * @param f    - A function that accepts arguments and returns an Effect
 * @param deps - Dependency array. The memoized function is recreated when dependencies change.
 *
 * @returns An Effect that produces a memoized function with the same signature as `f`
 *
 * @example
 * ```tsx
 * const MyComponent = Component.make(function* (props: { onSave: (data: Data) => void }) {
 *   const handleSave = yield* Component.useCallbackSync(
 *     (data: Data) => Effect.sync(() => props.onSave(data)),
 *     [props.onSave],
 *   )
 *
 *   return <button onClick={() => handleSave(myData)}>Save</button>
 * })
 * ```
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
 * Effect hook that memoizes a function that returns an Effect, providing asynchronous execution.
 *
 * This hook wraps a function that returns an Effect and returns a memoized version that:
 * - Executes the Effect asynchronously when called, returning a Promise
 * - Is memoized based on the provided dependency array
 * - Maintains referential equality across renders when dependencies don't change
 *
 * Use this to create stable callback references for async event handlers and other scenarios
 * where you need to execute Effects asynchronously from non-Effect code.
 *
 * @param f    - A function that accepts arguments and returns an Effect
 * @param deps - Dependency array. The memoized function is recreated when dependencies change.
 *
 * @returns An Effect that produces a memoized function that returns a Promise
 *
 * @example
 * ```tsx
 * const MyComponent = Component.make(function* (props: { onSave: (data: Data) => void }) {
 *   const handleSave = yield* Component.useCallbackPromise(
 *     (data: Data) => Effect.promise(() => props.onSave(data)),
 *     [props.onSave],
 *   )
 *
 *   return <button onClick={() => handleSave(myData)}>Save</button>
 * })
 * ```
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
 * Effect hook that constructs an Effect Layer and returns the resulting context.
 *
 * This hook creates a managed runtime from the provided layer and returns the context it produces.
 * The layer is reconstructed whenever its value changes, so ensure the layer reference is stable
 * (typically by memoizing it or defining it outside the component).
 *
 * The hook automatically manages the layer's lifecycle:
 * - The layer is built when the component mounts or when the layer reference changes
 * - Resources are properly released when the component unmounts or dependencies change
 * - Finalizers are executed according to the configured execution strategy
 *
 * @param layer   - The Effect Layer to construct. Should be a stable reference to avoid unnecessary
 *                  reconstruction. Consider memoizing with React.useMemo if defined inline.
 * @param options - Configuration for scope and finalizer behavior
 *
 * @returns An Effect that produces the context created by the layer
 *
 * @throws If the layer contains asynchronous effects, the component must be wrapped with `Async.async`
 *
 * @example
 * ```tsx
 * const MyLayer = Layer.succeed(MyService, new MyServiceImpl())
 * const MyComponent = Component.make(function*() {
 *   const context = yield* Component.useLayer(MyLayer)
 *   const Sub = yield* Effect.provide(SubComponent.use, context)
 *
 *   return <Sub />
 * })
 * ```
 *
 * @example With memoized layer
 * ```tsx
 * const MyComponent = Component.make(function*(props: { id: string })) {
 *   const context = yield* Component.useLayer(
 *     React.useMemo(() => Layer.succeed(MyService, new MyServiceImpl(props.id)), [props.id])
 *   )
 *   const Sub = yield* Effect.provide(SubComponent.use, context)
 *
 *   return <Sub />
 * })
 * ```
 *
 * @example With async layer
 * ```tsx
 * const MyAsyncLayer = Layer.effect(MyService, someAsyncEffect)
 * const MyComponent = Component.make(function*() {
 *   const context = yield* Component.useLayer(MyAsyncLayer)
 *   const Sub = yield* Effect.provide(SubComponent.use, context)
 *
 *   return <Sub />
 * }).pipe(
 *   Async.async // Required to handle async layer effects
 * )
 */
export const useLayer = <ROut, E, RIn>(
    layer: Layer.Layer<ROut, E, RIn>,
    options?: useContext.Options,
): Effect.Effect<Context.Context<ROut>, E, RIn | Scope.Scope> => useOnChange(() => Effect.context<RIn>().pipe(
    Effect.map(context => ManagedRuntime.make(Layer.provide(layer, Layer.succeedContext(context)))),
    Effect.tap(runtime => Effect.addFinalizer(() => runtime.disposeEffect)),
    Effect.andThen(runtime => runtime.runtimeEffect),
    Effect.andThen(runtime => runtime.context),
), [layer], options)
