import { describe, expect, it, vi } from "vitest"
import type * as Component from "./Component.js"
import * as Refreshable from "./Refreshable.js"


describe("Refreshable", () => {
    it("attaches a cell and notifies subscribers after a compatible update", async () => {
        const first = {} as Component.Component.Any
        const cell = Refreshable.makeCell(first, "hooks", false)
        const listener = vi.fn()

        expect(Refreshable.isRefreshable(first)).toBe(false)
        const attached = Refreshable.attach(first, cell)
        expect(attached).toBe(first)
        expect(Refreshable.isRefreshable(first)).toBe(true)
        expect(attached[Refreshable.RefreshableTypeId]).toBe(cell)
        expect(Object.getPrototypeOf(attached).asFunctionComponent)
            .toBe(Refreshable.RefreshablePrototype.asFunctionComponent)

        cell.subscribe(listener)
        const second = {} as Component.Component.Any
        cell.update(second, "hooks", false)

        expect(cell.current).toBe(second)
        expect(cell.snapshot).toEqual({
            revision: 1,
            resetRevision: 0,
        })

        await Promise.resolve()
        expect(listener).toHaveBeenCalledTimes(1)
    })

    it("requests a remount when a signature changes or reset is forced", () => {
        const component = {} as Component.Component.Any
        const cell = Refreshable.makeCell(component, "one", false)

        cell.update({} as Component.Component.Any, "two", false)
        expect(cell.snapshot.resetRevision).toBe(1)

        cell.update({} as Component.Component.Any, "two", true)
        expect(cell.snapshot.resetRevision).toBe(2)
    })

    it("builds the refresh shell from the current descriptor implementation", () => {
        const implementation = () => null
        const makeFunctionComponent = vi.fn(() => implementation)
        const component = {
            makeFunctionComponent,
        } as unknown as Component.ComponentImpl.Any
        const contextRef = {
            current: {},
        } as never
        const cell = Refreshable.makeCell(component, "hooks", false)
        const attached = Refreshable.attach(component, cell)

        expect(attached.asFunctionComponent(contextRef)).not.toBe(implementation)
        expect(makeFunctionComponent).toHaveBeenCalledWith(contextRef)
    })
})
