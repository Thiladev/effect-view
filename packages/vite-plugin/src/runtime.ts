import type * as Component from "effect-view/Component"
import * as Refreshable from "effect-view/Refreshable"

export interface HotContext {
    readonly data: Record<string, unknown>
    accept(): void
    invalidate(message?: string): void
}

interface RefreshData {
    readonly cells: Map<string, Refreshable.Cell>
    ids?: readonly string[]
}

const hotDataKey = "__effectViewRefresh"

const getRefreshData = (hot: HotContext): RefreshData => {
    const data = hot.data as Record<string, unknown>
    const current = data[hotDataKey] as RefreshData | undefined
    if (current)
        return current

    const refreshData: RefreshData = {
        cells: new Map(),
    }
    data[hotDataKey] = refreshData
    return refreshData
}

/**
 * Registers an Effect View descriptor in a Vite HMR data cell.
 *
 * This API is injected by `@effect-view/vite-plugin`; applications should not need to
 * call it directly.
 */
export const register = <A extends Component.Component.Any>(
    component: A,
    hot: HotContext | undefined,
    id: string,
    signature: string,
    forceReset = false,
): A => {
    if (!hot)
        return component

    const refreshData = getRefreshData(hot)
    const previous = refreshData.cells.get(id)
    if (!previous) {
        const cell = Refreshable.makeCell(component, signature, forceReset)
        refreshData.cells.set(id, cell)
        return Refreshable.attach(component, cell)
    }

    previous.update(component, signature, forceReset)
    return Refreshable.attach(component, previous)
}

const sameIds = (
    self: readonly string[],
    that: readonly string[],
): boolean => self.length === that.length
    && self.every((id, index) => id === that[index])

/**
 * Accepts an instrumented module when its Effect View definition set is
 * unchanged. Renames and removals invalidate upward so a stale cell cannot
 * remain mounted indefinitely.
 */
export const accept = (
    hot: HotContext | undefined,
    ids: readonly string[],
): void => {
    if (!hot)
        return

    const refreshData = getRefreshData(hot)
    const previousIds = refreshData.ids
    refreshData.ids = ids

    if (previousIds && !sameIds(previousIds, ids)) {
        hot.invalidate("[effect-view] Effect View exports changed")
        return
    }

    hot.accept()
}
