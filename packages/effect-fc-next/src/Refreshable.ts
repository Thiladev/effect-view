import type { Context, Scope } from "effect"
import * as React from "react"
import type * as Component from "./Component.js"


/**
 * A stable identifier used to associate an Effect View descriptor with its
 * development refresh cell.
 *
 * This low-level API is intended for development-server integrations such as
 * `@effect-view/vite-plugin`.
 */
export const RefreshableTypeId: unique symbol = Symbol.for("@effect-view/Refreshable/Refreshable")
export type RefreshableTypeId = typeof RefreshableTypeId

/**
 * The version observed by a mounted Effect View refresh shell.
 *
 * `revision` changes for every update. `resetRevision` changes only when the
 * adapter determines that preserving React state is unsafe.
 */
export interface Snapshot {
    readonly revision: number
    readonly resetRevision: number
}

/**
 * A mutable development cell holding the latest version of an Effect View
 * descriptor.
 *
 * This low-level API is intended for development-server integrations.
 */
export interface Cell {
    current: Component.ComponentImpl.Any
    signature: string
    forceReset: boolean
    snapshot: Snapshot
    readonly subscribe: (listener: () => void) => () => void
    readonly getSnapshot: () => Snapshot
    readonly update: (
        component: Component.Component.Any,
        signature: string,
        forceReset: boolean,
    ) => void
}

export const RefreshablePrototype = Object.freeze({
    asFunctionComponent<P extends {}, A extends React.ReactNode, E, R, F extends Component.Component.Signature>(
        this: Component.ComponentImpl<P, A, E, R, F> & Refreshable,
        contextRef: React.RefObject<Context.Context<Exclude<R, Scope.Scope>>>,
    ) {
        const cell = this[RefreshableTypeId]
        let current = cell.current
        let functionComponent = current.makeFunctionComponent(contextRef)

        // Calling the current renderer inside this stable component deliberately
        // keeps its hooks on the same fiber until resetRevision changes.
        const Implementation = (props: P) => {
            if (current !== cell.current) {
                current = cell.current
                functionComponent = current.makeFunctionComponent(contextRef)
            }
            return functionComponent(props)
        }

        const RefreshableComponent = (props: P) => {
            const snapshot = React.useSyncExternalStore(
                cell.subscribe,
                cell.getSnapshot,
                cell.getSnapshot,
            )
            return React.createElement(Implementation, {
                ...props,
                key: snapshot.resetRevision,
            })
        }

        return RefreshableComponent as F
    },
} as const)

export type RefreshablePrototype = typeof RefreshablePrototype

/**
 * A descriptor that can be connected to a development refresh cell.
 */
export interface Refreshable extends RefreshablePrototype {
    readonly [RefreshableTypeId]: Cell
}

/**
 * Checks whether a descriptor has been connected to a development refresh
 * cell.
 */
export const isRefreshable = <A extends object>(
    value: A,
): value is A & Refreshable => Object.hasOwn(value, RefreshableTypeId)

/**
 * Creates a refresh cell for an Effect View descriptor.
 *
 * This low-level API is intended for development-server integrations.
 */
export const makeCell = (
    component: Component.Component.Any,
    signature: string,
    forceReset: boolean,
): Cell => {
    const listeners = new Set<() => void>()
    let notificationPending = false

    const cell: Cell = {
        current: component as Component.ComponentImpl.Any,
        signature,
        forceReset,
        snapshot: {
            revision: 0,
            resetRevision: 0,
        },
        subscribe(listener) {
            listeners.add(listener)
            return () => {
                listeners.delete(listener)
            }
        },
        getSnapshot() {
            return cell.snapshot
        },
        update(nextComponent, nextSignature, nextForceReset) {
            const shouldReset = cell.forceReset
                || nextForceReset
                || cell.signature !== nextSignature

            cell.current = nextComponent as Component.ComponentImpl.Any
            cell.signature = nextSignature
            cell.forceReset = nextForceReset
            cell.snapshot = {
                revision: cell.snapshot.revision + 1,
                resetRevision: cell.snapshot.resetRevision + (shouldReset ? 1 : 0),
            }

            if (!notificationPending) {
                notificationPending = true
                queueMicrotask(() => {
                    notificationPending = false
                    for (const listener of listeners)
                        listener()
                })
            }
        },
    }

    return cell
}

/**
 * Associates a descriptor with a refresh cell and returns the descriptor.
 *
 * This low-level API is intended for development-server integrations.
 */
export const attach = <A extends Component.Component.Any>(
    component: A,
    cell: Cell,
): A & Refreshable => {
    if (!isRefreshable(component)) {
        Object.setPrototypeOf(
            component,
            Object.freeze(Object.setPrototypeOf(
                Object.assign({}, RefreshablePrototype),
                Object.getPrototypeOf(component),
            )),
        )
    }

    Object.defineProperty(component, RefreshableTypeId, {
        configurable: true,
        enumerable: true,
        value: cell,
    })
    return component as A & Refreshable
}
