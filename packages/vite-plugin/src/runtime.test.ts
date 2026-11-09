import type * as Component from "effect-view/Component"
import * as Refreshable from "effect-view/Refreshable"
import { describe, expect, it, vi } from "vitest"
import { accept, register } from "./runtime.js"


describe("refresh runtime", () => {
    const component = <A extends object>(value: A): A & Component.Component.Any =>
        value as A & Component.Component.Any

    const refreshCell = (value: Component.Component.Any): Refreshable.Cell => {
        if (!Refreshable.isRefreshable(value))
            throw new Error("Expected a refreshable component")
        return value[Refreshable.RefreshableTypeId]
    }

    it("retains a cell and notifies subscribers for compatible updates", async () => {
        const hot = {
            data: {},
            accept: vi.fn(),
            invalidate: vi.fn(),
        }
        const firstBody = () => {}
        const secondBody = () => {}
        const first = register(component({ body: firstBody }), hot, "module:View", "hooks")
        const cell = refreshCell(first)
        const listener = vi.fn()
        cell.subscribe(listener)
        expect(cell.body).toBe(firstBody)

        const second = register(component({ body: secondBody }), hot, "module:View", "hooks")
        const secondCell = refreshCell(second)

        expect(secondCell).toBe(cell)
        expect(cell.body).toBe(secondBody)
        expect(cell.snapshot).toEqual({
            revision: 1,
            resetRevision: 0,
        })

        await Promise.resolve()
        expect(listener).toHaveBeenCalledTimes(1)
    })

    it("increments resetRevision for incompatible and forced updates", () => {
        const hot = {
            data: {},
            accept: vi.fn(),
            invalidate: vi.fn(),
        }
        const first = register(component({ body: () => {} }), hot, "module:View", "one")
        const cell = refreshCell(first)

        register(component({ body: () => {} }), hot, "module:View", "two")
        expect(cell.snapshot.resetRevision).toBe(1)

        register(component({ body: () => {} }), hot, "module:View", "two", true)
        expect(cell.snapshot.resetRevision).toBe(2)
    })

    it("is inert outside a Vite hot context", () => {
        const body = () => {}
        const descriptor = component({ body })
        expect(register(descriptor, undefined, "module:View", "hooks")).toBe(descriptor)
        expect(Refreshable.isRefreshable(descriptor)).toBe(false)
        expect((descriptor as unknown as { body: unknown }).body).toBe(body)
    })

    it("invalidates when the module's View IDs change", () => {
        const hot = {
            data: {},
            accept: vi.fn(),
            invalidate: vi.fn(),
        }

        accept(hot, ["module:First"])
        expect(hot.accept).toHaveBeenCalledTimes(1)
        expect(hot.invalidate).not.toHaveBeenCalled()

        accept(hot, ["module:Second"])
        expect(hot.invalidate).toHaveBeenCalledWith("[effect-view] Effect View exports changed")
    })
})
