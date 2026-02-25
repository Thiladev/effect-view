/** biome-ignore-all lint/complexity/useArrowFunction: necessary for class prototypes */
import { type Equivalence, Function, Predicate } from "effect"
import * as React from "react"
import type * as Component from "./Component.js"


export const TypeId: unique symbol = Symbol.for("@effect-fc/Memoized/Memoized")
export type TypeId = typeof TypeId

export interface Memoized<P> extends MemoizedOptions<P> {
    readonly [TypeId]: TypeId
}

export interface MemoizedOptions<P> {
    readonly propsEquivalence?: Equivalence.Equivalence<P>
}


export const MemoizedPrototype = Object.freeze({
    [TypeId]: TypeId,

    transformFunctionComponent<P extends {}>(
        this: Memoized<P>,
        f: React.FC<P>,
    ) {
        return React.memo(f, this.propsEquivalence)
    },
} as const)


export const isMemoized = (u: unknown): u is Memoized<unknown> => Predicate.hasProperty(u, TypeId)

export const memoized = <T extends Component.Component<any, any, any, any>>(
    self: T
): T & Memoized<Component.Component.Props<T>> => Object.setPrototypeOf(
    Object.assign(function() {}, self),
    Object.freeze(Object.setPrototypeOf(
        Object.assign({}, MemoizedPrototype),
        Object.getPrototypeOf(self),
    )),
)

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
