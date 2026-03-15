/** biome-ignore-all lint/complexity/useArrowFunction: necessary for class prototypes */
import { type Equivalence, Function, Predicate } from "effect"
import * as React from "react"
import type * as Component from "./Component.js"


export const MemoizedTypeId: unique symbol = Symbol.for("@effect-fc/Memoized/Memoized")
export type MemoizedTypeId = typeof MemoizedTypeId


/**
 * A trait for `Component`'s that uses `React.memo` to optimize re-renders based on prop equality.
 *
 * @template P The props type of the component
 */
export interface Memoized<P> extends MemoizedPrototype, MemoizedOptions<P> {}

export interface MemoizedPrototype {
    readonly [MemoizedTypeId]: MemoizedTypeId
}

/**
 * Configuration options for Memoized components.
 *
 * @template P The props type of the component
 */
export interface MemoizedOptions<P> {
    /**
     * An optional equivalence function for comparing component props.
     * If provided, this function is used by React.memo to determine if props have changed.
     * Returns `true` if props are equivalent (no re-render), `false` if they differ (re-render).
     */
    readonly propsEquivalence?: Equivalence.Equivalence<P>
}


export const MemoizedPrototype: MemoizedPrototype = Object.freeze({
    [MemoizedTypeId]: MemoizedTypeId,

    transformFunctionComponent<P extends {}>(
        this: Memoized<P>,
        f: React.FC<P>,
    ) {
        return React.memo(f, this.propsEquivalence)
    },
} as const)


export const isMemoized = (u: unknown): u is Memoized<unknown> => Predicate.hasProperty(u, MemoizedTypeId)

/**
 * Converts a Component into a `Memoized` component that optimizes re-renders using `React.memo`.
 *
 * @param self - The component to convert to a Memoized component
 * @returns A new `Memoized` component with the same body, error, and context types as the input
 *
 * @example
 * ```ts
 * const MyMemoizedComponent = MyComponent.pipe(
 *   Memoized.memoized,
 * )
 * ```
 */
export const memoized = <T extends Component.Component<any, any, any, any>>(
    self: T
): T & Memoized<Component.Component.Props<T>> => Object.setPrototypeOf(
    Object.assign(function() {}, self),
    Object.freeze(Object.setPrototypeOf(
        Object.assign({}, MemoizedPrototype),
        Object.getPrototypeOf(self),
    )),
)

/**
 * Applies options to a Memoized component, returning a new Memoized component with the updated configuration.
 *
 * Supports both curried and uncurried application styles.
 *
 * @param self - The Memoized component to apply options to (in uncurried form)
 * @param options - The options to apply to the component
 * @returns A Memoized component with the applied options
 *
 * @example
 * ```ts
 * // Curried
 * const MyMemoizedComponent = MyComponent.pipe(
 *   Memoized.memoized,
 *   Memoized.withOptions({ propsEquivalence: (a, b) => a.id === b.id }),
 * )
 *
 * // Uncurried
 * const MyMemoizedComponent = Memoized.withOptions(
 *   Memoized.memoized(MyComponent),
 *   { propsEquivalence: (a, b) => a.id === b.id },
 * )
 * ```
 */
export const withOptions: {
    <T extends Component.Component<any, any, any, any> & Memoized<any>>(
        options: Partial<MemoizedOptions<Component.Component.Props<T>>>
    ): (self: T) => T
    <T extends Component.Component<any, any, any, any> & Memoized<any>>(
        self: T,
        options: Partial<MemoizedOptions<Component.Component.Props<T>>>,
    ): T
} = Function.dual(2, <T extends Component.Component<any, any, any, any> & Memoized<any>>(
    self: T,
    options: Partial<MemoizedOptions<Component.Component.Props<T>>>,
): T => Object.setPrototypeOf(
    Object.assign(function() {}, self, options),
    Object.getPrototypeOf(self),
))
