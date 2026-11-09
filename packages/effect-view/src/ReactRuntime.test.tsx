import { act, render, screen, waitFor } from "@testing-library/react"
// @effect-diagnostics missingLayerContext:skip-file
import { Context, Effect, Layer } from "effect"
import type * as React from "react"
import { describe, expect, it, vi } from "vitest"
import * as Component from "./Component.js"
import * as ReactRuntime from "./ReactRuntime.js"


class ValueService extends Context.Service<ValueService, { readonly value: string }>()("ValueService") {}

describe("ReactRuntime", () => {
    it("builds its layer for each mount of the provider and releases it on unmount", async () => {
        const setup = vi.fn()
        const cleanup = vi.fn()
        const runtime = ReactRuntime.make(Layer.effect(ValueService, Effect.gen(function*() {
            setup()
            yield* Effect.addFinalizer(() => Effect.sync(cleanup))
            return { value: "built" }
        })))

        const Probe = Component.makeUntraced("Probe")(function*() {
            return <div>{(yield* ValueService).value}</div>
        }).pipe(Component.withContext(runtime.context))

        const mount = async () => {
            let view!: ReturnType<typeof render>
            await act(async () => {
                view = render(
                    <ReactRuntime.Provider runtime={runtime} fallback={<p>starting</p>}>
                        <Probe />
                    </ReactRuntime.Provider>
                )
            })
            return view
        }

        const first = await mount()
        expect(await screen.findByText("built")).toBeTruthy()
        first.unmount()
        await waitFor(() => expect(cleanup).toHaveBeenCalledTimes(1))

        const second = await mount()
        expect(await screen.findByText("built")).toBeTruthy()
        expect(setup).toHaveBeenCalledTimes(2)
        second.unmount()
        await waitFor(() => expect(cleanup).toHaveBeenCalledTimes(2))
    })
})

class RootService extends Context.Service<RootService, { readonly name: string }>()("RootService") {}
class UserService extends Context.Service<UserService, { readonly id: string }>()("UserService") {}
class DraftService extends Context.Service<DraftService, { readonly title: string }>()("DraftService") {}

const renderAsync = async (ui: React.ReactElement) => {
    let view!: ReturnType<typeof render>
    await act(async () => { view = render(ui) })
    return view
}

// Stands for a router outlet: a plain React component, rendered with no Effect involved.
const Outlet = ({ outlet }: { readonly outlet: React.ReactNode }) => <>{outlet}</>

describe("ReactRuntime.extend", () => {
    const makeRuntimes = (hooks?: {
        readonly rootSetup?: () => void
        readonly userSetup?: () => void
        readonly userCleanup?: () => void
    }) => {
        const runtime = ReactRuntime.make(Layer.effect(RootService, Effect.sync(() => {
            hooks?.rootSetup?.()
            return { name: "root" }
        })))
        const UserRuntime = runtime.extend(Layer.effect(UserService, Effect.gen(function*() {
            const root = yield* RootService
            hooks?.userSetup?.()
            yield* Effect.addFinalizer(() => Effect.sync(() => hooks?.userCleanup?.()))
            return { id: `${ root.name }:user` }
        })))

        const Edit = Component.makeUntraced("Edit")(function*() {
            const root = yield* RootService
            const user = yield* UserService
            return <div>{root.name} {user.id}</div>
        }).pipe(Component.withContext(UserRuntime.context))

        // What a layout route does: it provides the extended runtime to the routes that its outlet renders.
        const tree = (
            <ReactRuntime.Provider runtime={runtime}>
                <ReactRuntime.Provider runtime={UserRuntime}>
                    <Outlet outlet={<Edit />} />
                </ReactRuntime.Provider>
            </ReactRuntime.Provider>
        )

        return { runtime, UserRuntime, Edit, tree }
    }

    it("provides the services of the parent and of the extension to components rendered by plain React", async () => {
        const { tree } = makeRuntimes()
        const view = await renderAsync(tree)

        expect(await screen.findByText("root root:user")).toBeTruthy()
        view.unmount()
    })

    it("shares the services of the parent and builds the extension for each mount", async () => {
        const rootSetup = vi.fn()
        const userSetup = vi.fn()
        const userCleanup = vi.fn()
        const { runtime, UserRuntime, Edit } = makeRuntimes({ rootSetup, userSetup, userCleanup })

        const Layout = Component.makeUntraced("Layout")(function*(props: { readonly shown: boolean }) {
            yield* RootService // the layout itself only needs the root context
            return props.shown
                ? <ReactRuntime.Provider runtime={UserRuntime}><Edit /></ReactRuntime.Provider>
                : <p>elsewhere</p>
        }).pipe(Component.withContext(runtime.context))

        const tree = (shown: boolean) => (
            <ReactRuntime.Provider runtime={runtime}><Layout shown={shown} /></ReactRuntime.Provider>
        )

        const view = await renderAsync(tree(true))
        expect(await screen.findByText("root root:user")).toBeTruthy()

        await act(async () => view.rerender(tree(false)))
        expect(await screen.findByText("elsewhere")).toBeTruthy()
        await waitFor(() => expect(userCleanup).toHaveBeenCalledTimes(1))

        await act(async () => view.rerender(tree(true)))
        expect(await screen.findByText("root root:user")).toBeTruthy()
        expect(userSetup).toHaveBeenCalledTimes(2)
        expect(rootSetup).toHaveBeenCalledTimes(1)

        view.unmount()
        await waitFor(() => expect(userCleanup).toHaveBeenCalledTimes(2))
    })

    it("can be extended again", async () => {
        const { runtime, UserRuntime } = makeRuntimes()
        const DraftRuntime = UserRuntime.extend(Layer.effect(DraftService, Effect.gen(function*() {
            return { title: `draft of ${ (yield* UserService).id }` }
        })))

        const Probe = Component.makeUntraced("Probe")(function*() {
            return <div>{(yield* DraftService).title}</div>
        }).pipe(Component.withContext(DraftRuntime.context))

        const view = await renderAsync(
            <ReactRuntime.Provider runtime={runtime}>
                <ReactRuntime.Provider runtime={UserRuntime}>
                    <ReactRuntime.Provider runtime={DraftRuntime}><Probe /></ReactRuntime.Provider>
                </ReactRuntime.Provider>
            </ReactRuntime.Provider>
        )

        expect(await screen.findByText("draft of root:user")).toBeTruthy()
        view.unmount()
    })

    it("throws a clear error when the provider of the parent is missing", async () => {
        const { UserRuntime } = makeRuntimes()
        const error = vi.spyOn(console, "error").mockImplementation(() => {})

        await expect(renderAsync(<ReactRuntime.Provider runtime={UserRuntime}><p>child</p></ReactRuntime.Provider>))
            .rejects.toThrow(/no Provider above it/)
        error.mockRestore()
    })

    it("throws a clear error when a component is rendered without the provider of its context", async () => {
        const { Edit } = makeRuntimes()
        const error = vi.spyOn(console, "error").mockImplementation(() => {})

        await expect(renderAsync(<Edit />)).rejects.toThrow(/has no Provider above it/)
        error.mockRestore()
    })

    it("only accepts components and layers whose requirements are provided", () => {
        const { runtime, UserRuntime } = makeRuntimes()
        const NeedsUser = Component.makeUntraced(function*() { return <div>{(yield* UserService).id}</div> })

        // @ts-expect-error UserService is not provided by the root context
        Component.withContext(NeedsUser, runtime.context)
        Component.withContext(NeedsUser, UserRuntime.context)

        const needsDraft = null as unknown as Layer.Layer<DraftService, never, DraftService>
        // @ts-expect-error the layer requires a service that the parent does not provide
        runtime.extend(needsDraft)
    })
})
