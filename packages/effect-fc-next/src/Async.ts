/** biome-ignore-all lint/complexity/useArrowFunction: necessary for class prototypes */
import { type Context, Effect, type Equivalence, Function, Predicate, Scope } from "effect"
import * as React from "react"
import * as Component from "./Component.js"


export const AsyncTypeId: unique symbol = Symbol.for("@effect-fc/Async/Async")
export type AsyncTypeId = typeof AsyncTypeId


/**
 * A trait for `Component`'s that allows them running asynchronous effects.
 */
export interface Async extends AsyncPrototype, AsyncOptions {}

export interface AsyncPrototype {
    readonly [AsyncTypeId]: AsyncTypeId
}

/**
 * Configuration options for `Async` components.
 */
export interface AsyncOptions {
    /**
     * The default fallback React node to display while the async operation is pending.
     * Used if no fallback is provided to the component when rendering.
     */
    readonly defaultFallback?: React.ReactNode
}

/**
 * Props for `Async` components.
 */
export type AsyncProps = Omit<React.SuspenseProps, "children">


export const AsyncPrototype: AsyncPrototype = Object.freeze({
    [AsyncTypeId]: AsyncTypeId,

    makeFunctionComponent<P extends {}, A extends React.ReactNode, E, R, F extends Component.Component.Signature>(
        this: Component.Component<P, A, E, R, F> & Async,
        contextRef: React.RefObject<Context.Context<Exclude<R, Scope.Scope>>>,
    ) {
        const Inner = (props: { readonly promise: Promise<React.ReactNode> }) => React.use(props.promise)

        return ({ fallback, name, ...props }: AsyncProps) => {
            const promise = Effect.runPromiseWith(contextRef.current)(
                Effect.flatMap(
                    Component.useScope([], this),
                    scope => Effect.provideService(this.body(props as P), Scope.Scope, scope),
                )
            )

            return React.createElement(
                React.Suspense,
                { fallback: fallback ?? this.defaultFallback, name },
                React.createElement(Inner, { promise }),
            )
        }
    },
} as const)

/**
 * An equivalence function for comparing `AsyncProps` that ignores the `fallback` property.
 * Used by default by async components with `Memoized.memoized` applied.
 */
export const defaultPropsEquivalence: Equivalence.Equivalence<AsyncProps> = (
    self: Record<string, unknown>,
    that: Record<string, unknown>,
) => {
    if (self === that)
        return true

    for (const key in self) {
        if (key === "fallback")
            continue
        if (!(key in that) || !Object.is(self[key], that[key]))
            return false
    }

    for (const key in that) {
        if (key === "fallback")
            continue
        if (!(key in self))
            return false
    }

    return true
}


export const isAsync = (u: unknown): u is Async => Predicate.hasProperty(u, AsyncTypeId)

/**
 * Converts a Component into an `Async` component that supports running asynchronous effects.
 *
 * Note: The component cannot have a prop named "promise" as it's reserved for internal use.
 *
 * @param self - The component to convert to an Async component
 * @returns A new `Async` component with the same body, error, and context types as the input
 *
 * @example
 * ```ts
 * const MyAsyncComponent = MyComponent.pipe(
 *   Async.async,
 * )
 * ```
 */
export const async = <T extends Component.Component.Any>(
    self: T & (
        "promise" extends keyof Component.Component.Props<T>
            ? "The 'promise' prop name is restricted for Async components. Please rename the 'promise' prop to something else."
            : T
    )
): (
    & Omit<T, keyof Component.Component.AsComponent<T>>
    & Component.Component<
        Component.Component.Props<T> & AsyncProps,
        Component.Component.Success<T>,
        Component.Component.Error<T>,
        Component.Component.Context<T>,
        Component.Component.DefaultSignature<Component.Component.Props<T> & AsyncProps, Component.Component.Success<T>>
    >
    & Async
) => Object.setPrototypeOf(
    Object.assign(function() {}, self, { propsEquivalence: defaultPropsEquivalence }),
    Object.freeze(Object.setPrototypeOf(
        Object.assign({}, AsyncPrototype),
        Object.getPrototypeOf(self),
    )),
)

/**
 * Applies options to an Async component, returning a new Async component with the updated configuration.
 *
 * Supports both curried and uncurried application styles.
 *
 * @param self - The Async component to apply options to (in uncurried form)
 * @param options - The options to apply to the component
 * @returns An Async component with the applied options
 *
 * @example
 * ```ts
 * // Curried
 * const MyAsyncComponent = MyComponent.pipe(
 *   Async.async,
 *   Async.withOptions({ defaultFallback: <p>Loading...</p> }),
 * )
 *
 * // Uncurried
 * const MyAsyncComponent = Async.withOptions(
 *   Async.async(MyComponent),
 *   { defaultFallback: <p>Loading...</p> },
 * )
 * ```
 */
export const withOptions: {
    <T extends Component.Component.Any & Async>(
        options: Partial<AsyncOptions>
    ): (self: T) => T
    <T extends Component.Component.Any & Async>(
        self: T,
        options: Partial<AsyncOptions>,
    ): T
} = Function.dual(2, <T extends Component.Component.Any & Async>(
    self: T,
    options: Partial<AsyncOptions>,
): T => Object.setPrototypeOf(
    Object.assign(function() {}, self, options),
    Object.getPrototypeOf(self),
))
