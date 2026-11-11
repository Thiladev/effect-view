import { Predicate } from "effect"
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
 * The version observed by a mounted Effect View component.
 *
 * `revision` changes for every update. `resetRevision` changes only when the
 * adapter determines that preserving React state is unsafe.
 */
export interface Snapshot {
    readonly revision: number
    readonly resetRevision: number
}

/**
 * The body of a component: what its descriptor runs on every render.
 */
export type Body = Component.ComponentImpl.Any["body"]

/**
 * A mutable development cell holding the latest body of an Effect View
 * descriptor.
 *
 * This low-level API is intended for development-server integrations.
 */
export interface Cell {
    body: Body
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

/**
 * A descriptor that is connected to a development refresh cell.
 */
export interface Refreshable {
    readonly [RefreshableTypeId]: Cell
}

/**
 * Checks whether a descriptor has been connected to a development refresh
 * cell. A descriptor derived from a refreshable one (with `Async.async`,
 * `Component.provide`, ...) is refreshable too: it runs the body of the cell.
 */
export const isRefreshable = <A extends object>(
    u: A,
): u is A & Refreshable => Predicate.hasProperty(u, RefreshableTypeId)

/**
 * The body a descriptor was defined with, without the one that `attach` put in
 * its place.
 */
const bodyOf = (component: Component.Component.Any): Body => {
    const body = (component as Component.ComponentImpl.Any).body
    return isRefreshable(body) ? body[RefreshableTypeId].body : body
}

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
        body: bodyOf(component),
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

            cell.body = bodyOf(nextComponent)
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
 * Makes the body of a descriptor run the latest body of a cell, and the
 * component re-render when the cell is updated.
 *
 * A descriptor derived from this one copies the body, so it follows the cell
 * too. The component is not wrapped: the subscription is the first hook of its
 * own body, which is why a change of the hooks it calls needs a remount, that
 * `useFunctionComponent` does when `resetRevision` changes.
 */
const refreshingBody = (cell: Cell): Body => {
    const body = (props: unknown) => {
        React.useSyncExternalStore(cell.subscribe, cell.getSnapshot, cell.getSnapshot)
        return cell.body(props as never)
    }

    return Object.defineProperty(body, RefreshableTypeId, {
        value: cell,
    }) as unknown as Body
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
    Object.defineProperties(component, {
        body: {
            configurable: true,
            enumerable: true,
            writable: true,
            value: refreshingBody(cell),
        },
        [RefreshableTypeId]: {
            configurable: true,
            enumerable: true,
            value: cell,
        },
    })
    return component as A & Refreshable
}
