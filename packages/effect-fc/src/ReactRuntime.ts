/** biome-ignore-all lint/complexity/useArrowFunction: necessary for class prototypes */
import { Effect, Layer, ManagedRuntime, Predicate, Runtime, Scope } from "effect"
import * as React from "react"
import * as Component from "./Component.js"
import * as ErrorObserver from "./ErrorObserver.js"
import * as QueryClient from "./QueryClient.js"


export const TypeId: unique symbol = Symbol.for("@effect-fc/ReactRuntime/ReactRuntime")
export type TypeId = typeof TypeId

export interface ReactRuntime<R, ER> {
    new(_: never): Record<string, never>
    readonly [TypeId]: TypeId
    readonly runtime: ManagedRuntime.ManagedRuntime<R, ER>
    readonly context: React.Context<Runtime.Runtime<R>>
}

const ReactRuntimeProto = Object.freeze({ [TypeId]: TypeId } as const)

export const Prelude: Layer.Layer<
    | Component.ScopeMap
    | ErrorObserver.ErrorObserver
    | QueryClient.QueryClient
> = Layer.mergeAll(
    Component.ScopeMap.Default,
    ErrorObserver.layer,
    QueryClient.QueryClient.Default,
)


export const isReactRuntime = (u: unknown): u is ReactRuntime<unknown, unknown> => Predicate.hasProperty(u, TypeId)

export const make = <R, ER>(
    layer: Layer.Layer<R, ER>,
    memoMap?: Layer.MemoMap,
): ReactRuntime<Layer.Layer.Success<typeof Prelude> | R, ER> => Object.setPrototypeOf(
    Object.assign(function() {}, {
        runtime: ManagedRuntime.make(
            Layer.merge(layer, Prelude),
            memoMap,
        ),
        // biome-ignore lint/style/noNonNullAssertion: context initialization
        context: React.createContext<Runtime.Runtime<R>>(null!),
    }),
    ReactRuntimeProto,
)


export namespace Provider {
    export interface Props<R, ER> extends React.SuspenseProps {
        readonly runtime: ReactRuntime<R, ER>
        readonly children?: React.ReactNode
    }
}

export const Provider = <R, ER>(
    { runtime, children, ...suspenseProps }: Provider.Props<R, ER>
): React.ReactNode => {
    const promise = React.useMemo(() => Effect.runPromise(runtime.runtime.runtimeEffect), [runtime])

    return React.createElement(
        React.Suspense,
        suspenseProps,
        React.createElement(ProviderInner<R, ER>, { runtime, promise, children }),
    )
}

const ProviderInner = <R, ER>(
    { runtime, promise, children }: {
        readonly runtime: ReactRuntime<R, ER>
        readonly promise: Promise<Runtime.Runtime<R>>
        readonly children?: React.ReactNode
    }
): React.ReactNode => {
    const effectRuntime = React.use(promise)
    const scope = Runtime.runSync(effectRuntime)(Component.useScope([effectRuntime]))
    Runtime.runSync(effectRuntime)(Effect.provideService(
        Component.useOnChange(() => Effect.addFinalizer(() => runtime.runtime.disposeEffect), [scope]),
        Scope.Scope,
        scope,
    ))

    return React.createElement(runtime.context, { value: effectRuntime }, children)
}
