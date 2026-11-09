import { describe, expect, it, vi } from "vitest"
import type * as Component from "./Component.js"
import * as Refreshable from "./Refreshable.js"


const descriptor = (body: unknown = () => {}) => ({ body }) as unknown as Component.Component.Any

describe("Refreshable", () => {
    it("attaches a cell and notifies subscribers after a compatible update", async () => {
        const firstBody = () => {}
        const first = descriptor(firstBody)
        const cell = Refreshable.makeCell(first, "hooks", false)
        const listener = vi.fn()

        expect(cell.body).toBe(firstBody)
        expect(Refreshable.isRefreshable(first)).toBe(false)
        const attached = Refreshable.attach(first, cell)
        expect(attached).toBe(first)
        expect(Refreshable.isRefreshable(first)).toBe(true)
        expect(attached[Refreshable.RefreshableTypeId]).toBe(cell)

        cell.subscribe(listener)
        const secondBody = () => {}
        cell.update(descriptor(secondBody), "hooks", false)

        expect(cell.body).toBe(secondBody)
        expect(cell.snapshot).toEqual({
            revision: 1,
            resetRevision: 0,
        })

        await Promise.resolve()
        expect(listener).toHaveBeenCalledTimes(1)
    })

    it("requests a remount when a signature changes or reset is forced", () => {
        const cell = Refreshable.makeCell(descriptor(), "one", false)

        cell.update(descriptor(), "two", false)
        expect(cell.snapshot.resetRevision).toBe(1)

        cell.update(descriptor(), "two", true)
        expect(cell.snapshot.resetRevision).toBe(2)
    })

    it("replaces the body of the descriptor, and a copy of the descriptor is refreshable too", () => {
        const original = () => {}
        const component = descriptor(original)
        const cell = Refreshable.makeCell(component, "hooks", false)
        Refreshable.attach(component, cell)

        const body = (component as unknown as { body: unknown }).body
        expect(body).not.toBe(original)

        // A descriptor derived from this one (`Async.async`, `Component.provide`, ...) copies its properties.
        const derived = Object.assign({}, component) as unknown as Component.Component.Any
        expect(Refreshable.isRefreshable(derived)).toBe(true)
        expect(derived[Refreshable.RefreshableTypeId as never]).toBe(cell)
        expect((derived as unknown as { body: unknown }).body).toBe(body)
    })

    it("never takes the body that attach put in a descriptor for its own", () => {
        const original = () => {}
        const component = descriptor(original)
        const cell = Refreshable.makeCell(component, "hooks", false)
        Refreshable.attach(component, cell)

        // Updating the cell from a descriptor that is already attached does not make the cell run itself.
        cell.update(component, "hooks", false)
        expect(cell.body).toBe(original)
    })
})
