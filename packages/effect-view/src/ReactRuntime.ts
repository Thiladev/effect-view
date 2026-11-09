/** biome-ignore-all lint/complexity/useArrowFunction: necessary for class prototypes */
import { type Context, Effect, Layer, ManagedRuntime, Pipeable, Predicate } from "effect"
import * as React from "react"
import * as Component from "./Component.js"
import * as ScopeRegistry from "./ScopeRegistry.js"


export const ReactRuntimeTypeId: unique symbol = Symbol.for("@effect-view/ReactRuntime/ReactRuntime")
export type ReactRuntimeTypeId = typeof ReactRuntimeTypeId

export interface ReactRuntime<R, ER> extends ReactRuntimePrototype<R, ER> {
    new(_: never): Record<string, never>
    readonly context: React.Context<Context.Context<R>>
}

export const isReactRuntime = (u: unknown): u is ReactRuntime<unknown, unknown> => Predicate.hasProperty(u, ReactRuntimeTypeId)

export interface ReactRuntimeImpl<R, ER> extends ReactRuntime<R, ER> {
    Provider(props: ReactRuntimeImpl.ProviderProps): React.ReactNode
}

export declare namespace ReactRuntimeImpl {
    export interface ProviderProps extends React.SuspenseProps {
        readonly children?: React.ReactNode
    }
}

export interface ReactRuntimePrototype<R, ER> extends Pipeable.Pipeable {
    readonly [ReactRuntimeTypeId]: ReactRuntimeTypeId

    /**
     * Extends the runtime with the services of a layer, for a subtree of the application.
     *
     * Render the `Provider` of the extended runtime below the one of its parent. The layer is built on top of the
     * context of the parent each time the provider mounts, and released when it unmounts. Components rendered by plain
     * React in that subtree, for example the routes of a router, read the extended context with
     * `Component.withContext(component, extended.context)`.
     *
     * @example
     * ```tsx
     * const UserRuntime = runtime.extend(CurrentUser.layer)
     *
     * const UserLayout = Component.make(function*() {
     *   return (
     *     <ReactRuntime.Provider runtime={UserRuntime}>
     *       <Outlet />
     *     </ReactRuntime.Provider>
     *   )
     * }).pipe(Component.withContext(runtime.context))
     *
     * export const Route = createFileRoute("/user/edit")({
     *   component: Component.withContext(EditUser, UserRuntime.context),
     * })
     * ```
     */
    extend<R2, E2>(layer: Layer.Layer<R2, E2, R>): ExtendedReactRuntime<R, R2, ER, E2>
}

export const ReactRuntimePrototype: ReactRuntimePrototype<any, any> = Object.freeze({
    [ReactRuntimeTypeId]: ReactRuntimeTypeId,
    ...Pipeable.Prototype,

    extend<R, ER, R2, E2>(
        this: ReactRuntime<R, ER>,
        layer: Layer.Layer<R2, E2, R>,
    ): ExtendedReactRuntime<R, R2, ER, E2> {
        return Object.setPrototypeOf(
            Object.assign(function() {}, {
                parent: this,
                layer,
                // biome-ignore lint/style/noNonNullAssertion: context initialization
                context: React.createContext<Context.Context<R | R2>>(null!),
            }),
            ExtendedReactRuntimePrototype,
        )
    },
} as const)


export interface RootReactRuntime<R, ER>
extends ReactRuntime<R, ER>, RootReactRuntimePrototype<R, ER> {}

export interface RootReactRuntimeImpl<R, ER>
extends RootReactRuntime<R, ER>, ReactRuntimeImpl<R, ER>, RootReactRuntimeImplPrototype {
    readonly layer: Layer.Layer<R, ER>
}

export interface RootReactRuntimeImplPrototype {
    Provider(props: ReactRuntimeImpl.ProviderProps): React.ReactNode
}

export const RootReactRuntimeImplPrototype: RootReactRuntimeImplPrototype = Object.freeze({
    Provider<R, ER>(
        this: RootReactRuntimeImpl<R, ER>,
        props: ReactRuntimeImpl.ProviderProps,
    ): React.ReactNode {
        // biome-ignore lint/correctness/useHookAtTopLevel: only called while rendering the Provider component
        const [managedRuntime] = React.useState(() => ManagedRuntime.make(this.layer))
        // biome-ignore lint/correctness/useHookAtTopLevel: only called while rendering the Provider component
        return useProvider(this, managedRuntime, props)
    },
} as const)

export interface RootReactRuntimePrototype<R, ER> extends ReactRuntimePrototype<R, ER> {}

export const RootReactRuntimePrototype: RootReactRuntimePrototype<any, any> = Object.freeze(
    Object.setPrototypeOf(
        Object.defineProperties({}, Object.getOwnPropertyDescriptors(RootReactRuntimeImplPrototype)),
        ReactRuntimePrototype,
    ) as RootReactRuntimePrototype<any, any>
)

export const preludeLayer: Layer.Layer<ScopeRegistry.ScopeRegistry> = ScopeRegistry.layer

export const make = <R, ER>(
    layer: Layer.Layer<R, ER>,
): RootReactRuntime<Layer.Success<typeof preludeLayer> | R, ER> => Object.setPrototypeOf(
    Object.assign(function() {}, {
        layer: Layer.merge(preludeLayer, layer),
        // biome-ignore lint/style/noNonNullAssertion: context initialization
        context: React.createContext<Context.Context<Layer.Success<typeof preludeLayer> | R>>(null!),
    }),
    RootReactRuntimePrototype,
)


export interface ExtendedReactRuntime<R1, R2, E1, E2>
extends ReactRuntime<R1 | R2, E1 | E2>, ExtendedReactRuntimePrototype<R1, R2, E1, E2> {}

export interface ExtendedReactRuntimeImpl<R1, R2, E1, E2>
extends ExtendedReactRuntime<R1, R2, E1, E2>, ReactRuntimeImpl<R1 | R2, E1 | E2>, ExtendedReactRuntimeImplPrototype {
    readonly parent: ReactRuntime<R1, E1>
    readonly layer: Layer.Layer<R2, E2, R1>
}

export interface ExtendedReactRuntimeImplPrototype {
    Provider(props: ReactRuntimeImpl.ProviderProps): React.ReactNode
}

export const ExtendedReactRuntimeImplPrototype: ExtendedReactRuntimeImplPrototype = Object.freeze({
    Provider<R1, R2, E1, E2>(
        this: ExtendedReactRuntimeImpl<R1, R2, E1, E2>,
        props: ReactRuntimeImpl.ProviderProps,
    ): React.ReactNode {
        // biome-ignore lint/correctness/useHookAtTopLevel: only called while rendering the Provider component
        const parentContext = React.useContext(this.parent.context)
        if (parentContext == null)
            throw new Error(
                "ReactRuntime.extend: the parent of this runtime has no Provider above it. " +
                "Render the Provider of the parent above the Provider of the extended runtime."
            )

        // biome-ignore lint/correctness/useHookAtTopLevel: only called while rendering the Provider component
        const [managedRuntime] = React.useState(() => ManagedRuntime.make(
            Layer.provideMerge(this.layer, Layer.succeedContext(parentContext)),
        ))
        // biome-ignore lint/correctness/useHookAtTopLevel: only called while rendering the Provider component
        return useProvider(this, managedRuntime, props)
    },
} as const)

export interface ExtendedReactRuntimePrototype<R1, R2, E1, E2> extends ReactRuntimePrototype<R1 | R2, E1 | E2> {}

export const ExtendedReactRuntimePrototype: ExtendedReactRuntimePrototype<any, any, any, any> = Object.freeze(
    Object.setPrototypeOf(
        Object.defineProperties({}, Object.getOwnPropertyDescriptors(ExtendedReactRuntimeImplPrototype)),
        ReactRuntimePrototype,
    ) as ExtendedReactRuntimePrototype<any, any, any, any>
)


const useProvider = <R, ER>(
    runtime: ReactRuntime<R, ER>,
    managedRuntime: ManagedRuntime.ManagedRuntime<R, ER>,
    { children, ...suspenseProps }: ReactRuntimeImpl.ProviderProps,
): React.ReactNode => {
    const promise = React.useMemo(() => managedRuntime.context(), [managedRuntime])

    return React.createElement(
        React.Suspense,
        suspenseProps,
        React.createElement(ProviderInner<R, ER>, { runtime, managedRuntime, promise, children }),
    )
}

const ProviderInner = <R, ER>(
    { runtime, managedRuntime, promise, children }: {
        readonly runtime: ReactRuntime<R, ER>
        readonly managedRuntime: ManagedRuntime.ManagedRuntime<R, ER>
        readonly promise: Promise<Context.Context<R>>
        readonly children?: React.ReactNode
    }
): React.ReactNode => {
    const context = React.use(promise)
    Effect.runSyncWith(context)(Component.useOnChange(
        // Detached: disposing the runtime disposes the ScopeRegistry, which waits for the scopes being closed, and the
        // scope of this component is one of them.
        () => Effect.addFinalizer(() => Effect.forkDetach(managedRuntime.disposeEffect)),
        [managedRuntime],
    ))

    return React.createElement(runtime.context, { value: context }, children)
}


export namespace Provider {
    export interface Props<R, ER> extends ReactRuntimeImpl.ProviderProps {
        readonly runtime: ReactRuntime<R, ER>
    }
}

export const Provider = <R, ER>(
    { runtime, ...props }: Provider.Props<R, ER>
): React.ReactNode => (runtime as ReactRuntimeImpl<R, ER>).Provider(props)
