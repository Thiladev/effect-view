/** biome-ignore-all lint/complexity/useArrowFunction: necessary for class prototypes */
import { Effect, Function, Predicate, Runtime, Scope } from "effect"
import * as React from "react"
import * as Component from "./Component.js"


export const TypeId: unique symbol = Symbol.for("@effect-fc/Async/Async")
export type TypeId = typeof TypeId

export interface Async extends AsyncOptions {
    readonly [TypeId]: TypeId
}

export interface AsyncOptions {
    readonly defaultFallback?: React.ReactNode
}

export type AsyncProps = Omit<React.SuspenseProps, "children">


export const AsyncPrototype = Object.freeze({
    [TypeId]: TypeId,

    asFunctionComponent<P extends {}, A extends React.ReactNode, E, R>(
        this: Component.Component<P, A, E, R> & Async,
        runtimeRef: React.RefObject<Runtime.Runtime<Exclude<R, Scope.Scope>>>,
    ) {
        const SuspenseInner = (props: { readonly promise: Promise<React.ReactNode> }) => React.use(props.promise)

        return ({ fallback, name, ...props }: AsyncProps) => {
            const promise = Runtime.runPromise(runtimeRef.current)(
                Effect.andThen(
                    Component.useScope([], this),
                    scope => Effect.provideService(this.body(props as P), Scope.Scope, scope),
                )
            )

            return React.createElement(
                React.Suspense,
                { fallback: fallback ?? this.defaultFallback, name },
                React.createElement(SuspenseInner, { promise }),
            )
        }
    },
} as const)


export const isAsync = (u: unknown): u is Async => Predicate.hasProperty(u, TypeId)

export const async = <T extends Component.Component<any, any, any, any>>(
    self: T
): (
    & Omit<T, keyof Component.Component.AsComponent<T>>
    & Component.Component<
        Component.Component.Props<T> & AsyncProps,
        Component.Component.Success<T>,
        Component.Component.Error<T>,
        Component.Component.Context<T>
    >
    & Async
) => Object.setPrototypeOf(
    Object.assign(function() {}, self),
    Object.freeze(Object.setPrototypeOf(
        Object.assign({}, AsyncPrototype),
        Object.getPrototypeOf(self),
    )),
)

export const withOptions: {
    <T extends Component.Component<any, any, any, any> & Async>(
        options: Partial<AsyncOptions>
    ): (self: T) => T
    <T extends Component.Component<any, any, any, any> & Async>(
        self: T,
        options: Partial<AsyncOptions>,
    ): T
} = Function.dual(2, <T extends Component.Component<any, any, any, any> & Async>(
    self: T,
    options: Partial<AsyncOptions>,
): T => Object.setPrototypeOf(
    Object.assign(function() {}, self, options),
    Object.getPrototypeOf(self),
))
