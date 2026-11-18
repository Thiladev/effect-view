/** biome-ignore-all lint/complexity/useArrowFunction: necessary for class prototypes */
import { Cause, type Context, Effect, Exit, Layer, ManagedRuntime, Pipeable, Predicate } from "effect"
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
    /** Creates the managed runtime of a provider. Only called while rendering a provider component. */
    useManagedRuntime(): ManagedRuntime.ManagedRuntime<R, ER>
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
extends RootReactRuntime<R, ER>, ReactRuntimeImpl<R, ER>, RootReactRuntimeImplPrototype<R, ER> {
    readonly layer: Layer.Layer<R, ER>
}

export interface RootReactRuntimeImplPrototype<R, ER> {
    useManagedRuntime(): ManagedRuntime.ManagedRuntime<R, ER>
}

export const RootReactRuntimeImplPrototype: RootReactRuntimeImplPrototype<any, any> = Object.freeze({
    useManagedRuntime<R, ER>(this: RootReactRuntimeImpl<R, ER>): ManagedRuntime.ManagedRuntime<R, ER> {
        return React.useState(() => ManagedRuntime.make(this.layer))[0]
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
extends ExtendedReactRuntime<R1, R2, E1, E2>, ReactRuntimeImpl<R1 | R2, E1 | E2>, ExtendedReactRuntimeImplPrototype<R1, R2, E1, E2> {
    readonly parent: ReactRuntime<R1, E1>
    readonly layer: Layer.Layer<R2, E2, R1>
}

export interface ExtendedReactRuntimeImplPrototype<R1, R2, E1, E2> {
    useManagedRuntime(): ManagedRuntime.ManagedRuntime<R1 | R2, E1 | E2>
}

export const ExtendedReactRuntimeImplPrototype: ExtendedReactRuntimeImplPrototype<any, any, any, any> = Object.freeze({
    useManagedRuntime<R1, R2, E1, E2>(
        this: ExtendedReactRuntimeImpl<R1, R2, E1, E2>,
    ): ManagedRuntime.ManagedRuntime<R1 | R2, E1 | E2> {
        const parentContext = React.useContext(this.parent.context)
        if (parentContext == null)
            throw new Error(
                "ReactRuntime.extend: the parent of this runtime has no Provider above it. " +
                "Render the Provider of the parent above the Provider of the extended runtime."
            )

        return React.useState(() => ManagedRuntime.make(
            Layer.provideMerge(this.layer, Layer.succeedContext(parentContext)),
        ))[0]
    },
} as const)

export interface ExtendedReactRuntimePrototype<R1, R2, E1, E2> extends ReactRuntimePrototype<R1 | R2, E1 | E2> {}

export const ExtendedReactRuntimePrototype: ExtendedReactRuntimePrototype<any, any, any, any> = Object.freeze(
    Object.setPrototypeOf(
        Object.defineProperties({}, Object.getOwnPropertyDescriptors(ExtendedReactRuntimeImplPrototype)),
        ReactRuntimePrototype,
    ) as ExtendedReactRuntimePrototype<any, any, any, any>
)


export namespace Provider {
    export interface Props<R, ER> {
        readonly runtime: ReactRuntime<R, ER>
        readonly children?: React.ReactNode
    }
}

/**
 * Builds the layer of the runtime synchronously while rendering, and provides the resulting context to its children.
 *
 * Throws if the layer does not complete synchronously (use `AsyncProvider` for that), or if it fails: put a React
 * error boundary above the provider if the construction can fail.
 */
export const Provider = <R, ER>(
    { runtime, children }: Provider.Props<R, ER>
): React.ReactNode => {
    const managedRuntime = (runtime as ReactRuntimeImpl<R, ER>).useManagedRuntime()
    const context = React.useMemo(() => {
        const exit = Effect.runSyncExit(managedRuntime.contextEffect)
        if (Exit.isSuccess(exit))
            return exit.value

        // Releases whatever the unfinished build has acquired, since nothing will ever mount to do it.
        void managedRuntime.dispose()
        const error = Cause.squash(exit.cause)
        throw Cause.isAsyncFiberError(error)
            ? new Error(
                "ReactRuntime.Provider: the layer of the runtime did not complete synchronously. " +
                "Use ReactRuntime.AsyncProvider to build a layer that is asynchronous."
            )
            : error
    }, [managedRuntime])

    useDispose(context, managedRuntime)
    return React.createElement(runtime.context, { value: context }, children)
}


export namespace AsyncProvider {
    export interface Props<R, ER> extends React.SuspenseProps {
        readonly runtime: ReactRuntime<R, ER>
        readonly children?: React.ReactNode
    }
}

/**
 * Builds the layer of the runtime asynchronously, suspending until it is ready, and provides the resulting context to
 * its children. The `fallback` is displayed in the meantime.
 *
 * A failing layer goes to the nearest React error boundary above the provider.
 */
export const AsyncProvider = <R, ER>(
    { runtime, children, ...suspenseProps }: AsyncProvider.Props<R, ER>
): React.ReactNode => {
    const managedRuntime = (runtime as ReactRuntimeImpl<R, ER>).useManagedRuntime()
    const promise = React.useMemo(() => managedRuntime.context(), [managedRuntime])

    return React.createElement(
        React.Suspense,
        suspenseProps,
        React.createElement(AsyncProviderInner<R, ER>, { runtime, managedRuntime, promise, children }),
    )
}

const AsyncProviderInner = <R, ER>(
    { runtime, managedRuntime, promise, children }: {
        readonly runtime: ReactRuntime<R, ER>
        readonly managedRuntime: ManagedRuntime.ManagedRuntime<R, ER>
        readonly promise: Promise<Context.Context<R>>
        readonly children?: React.ReactNode
    }
): React.ReactNode => {
    const context = React.use(promise)
    useDispose(context, managedRuntime)
    return React.createElement(runtime.context, { value: context }, children)
}

const useDispose = <R, ER>(
    context: Context.Context<R>,
    managedRuntime: ManagedRuntime.ManagedRuntime<R, ER>,
): void => Effect.runSyncWith(context)(Component.useOnChange(
    // Detached: disposing the runtime disposes the ScopeRegistry, which waits for the scopes being closed, and the
    // scope of this component is one of them.
    () => Effect.addFinalizer(() => Effect.forkDetach(managedRuntime.disposeEffect)),
    [managedRuntime],
))
