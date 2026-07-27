/** biome-ignore-all lint/complexity/useArrowFunction: necessary for class prototypes */
import { type Context, Effect, Layer, ManagedRuntime, Predicate } from "effect"
import * as React from "react"
import * as Component from "./Component.js"
import * as ScopeRegistry from "./ScopeRegistry.js"


export const ReactRuntimeTypeId: unique symbol = Symbol.for("@effect-view/ReactRuntime/ReactRuntime")
export type ReactRuntimeTypeId = typeof ReactRuntimeTypeId

export interface ReactRuntime<R, ER> {
    new(_: never): Record<string, never>
    readonly [ReactRuntimeTypeId]: ReactRuntimeTypeId
    readonly runtime: ManagedRuntime.ManagedRuntime<R, ER>
    readonly context: React.Context<Context.Context<R>>
}

const ReactRuntimePrototype = Object.freeze({ [ReactRuntimeTypeId]: ReactRuntimeTypeId } as const)

export const preludeLayer: Layer.Layer<ScopeRegistry.ScopeRegistry> = ScopeRegistry.layer

export const isReactRuntime = (u: unknown): u is ReactRuntime<unknown, unknown> => Predicate.hasProperty(u, ReactRuntimeTypeId)

export const make = <R, ER>(
    layer: Layer.Layer<R, ER>,
    memoMap?: Layer.MemoMap,
): ReactRuntime<Layer.Success<typeof preludeLayer> | R, ER> => Object.setPrototypeOf(
    Object.assign(function() {}, {
        runtime: ManagedRuntime.make(
            Layer.merge(preludeLayer, layer),
            { memoMap },
        ),
        // biome-ignore lint/style/noNonNullAssertion: context initialization
        context: React.createContext<Context.Context<Layer.Success<typeof preludeLayer> | R>>(null!),
    }),
    ReactRuntimePrototype,
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
    const promise = React.useMemo(() => runtime.runtime.context(), [runtime])

    return React.createElement(
        React.Suspense,
        suspenseProps,
        React.createElement(ProviderInner<R, ER>, { runtime, promise, children }),
    )
}

const ProviderInner = <R, ER>(
    { runtime, promise, children }: {
        readonly runtime: ReactRuntime<R, ER>
        readonly promise: Promise<Context.Context<R>>
        readonly children?: React.ReactNode
    }
): React.ReactNode => {
    const context = React.use(promise)
    Effect.runSyncWith(context)(Component.useOnChange(
        () => Effect.addFinalizer(() => runtime.runtime.disposeEffect),
        [runtime],
    ))

    return React.createElement(runtime.context, { value: context }, children)
}
