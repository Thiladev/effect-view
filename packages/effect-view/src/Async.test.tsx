import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Context, Effect, HashMap, Layer, ManagedRuntime, Ref } from "effect"
import * as React from "react"
import { describe, expect, it, vi } from "vitest"
import * as Async from "./Async.js"
import * as Component from "./Component.js"
import * as Memoized from "./Memoized.js"
import * as ReactRuntime from "./ReactRuntime.js"
import * as ScopeRegistry from "./ScopeRegistry.js"

class ErrorBoundary extends React.Component<
    { readonly children: React.ReactNode; readonly fallback: React.ReactNode },
    { readonly failed: boolean }
> {
    state = { failed: false }
    static getDerivedStateFromError() { return { failed: true } }
    render() { return this.state.failed ? this.props.fallback : this.props.children }
}

const renderAsync = async (ui: React.ReactElement) => {
    let view!: ReturnType<typeof render>
    await act(async () => { view = render(ui) })
    return view
}

describe("Async", () => {
    it("does not rerun for an unrelated parent state update", async () => {
        const load = vi.fn((_id: number) => Effect.never)
        const renderPost = vi.fn()
        const runtime = ReactRuntime.make(Layer.empty)

        const Post = Component.make("Post")(function*(props: { readonly id: number }) {
            renderPost()
            const value = yield* Component.useOnChange(() => load(props.id), [props.id])
            return <div>{value}</div>
        }).pipe(
            Async.async,
            Memoized.memoized,
        )

        const Parent = Component.make("Parent")(function*() {
            const [text, setText] = React.useState("")
            const AsyncPost = yield* Post.use

            return <>
                <input
                    aria-label="text"
                    value={text}
                    onChange={event => setText(event.currentTarget.value)}
                />
                <AsyncPost id={1} fallback={<div>loading</div>} />
            </>
        }).pipe(Component.withContext(runtime.context))

        let view!: ReturnType<typeof render>
        await act(async () => {
            view = render(
                <ReactRuntime.Provider runtime={runtime}>
                    <Parent />
                </ReactRuntime.Provider>,
            )
        })

        expect(screen.getByText("loading")).toBeTruthy()
        expect(load).toHaveBeenCalledTimes(2)
        const callsAfterLoad = load.mock.calls.length
        const rendersAfterLoad = renderPost.mock.calls.length

        await act(async () => {
            fireEvent.change(screen.getByLabelText("text"), { target: { value: "a" } })
        })
        expect(load).toHaveBeenCalledTimes(callsAfterLoad)
        expect(renderPost).toHaveBeenCalledTimes(rendersAfterLoad)

        view.unmount()
    })

    it("shows the fallback while the effect is pending, then the result", async () => {
        const runtime = ReactRuntime.make(Layer.empty)

        const Greeting = Component.make("Greeting")(function*(props: { readonly who: string }) {
            yield* Effect.sleep("30 millis")
            return <div>hello {props.who}</div>
        }).pipe(
            Async.async,
            Component.withContext(runtime.context),
        )

        const view = await renderAsync(
            <ReactRuntime.Provider runtime={runtime}>
                <Greeting who="world" fallback={<div>loading</div>} />
            </ReactRuntime.Provider>,
        )

        expect(screen.getByText("loading")).toBeTruthy()
        expect(screen.queryByText("hello world")).toBeNull()

        expect(await screen.findByText("hello world")).toBeTruthy()
        expect(screen.queryByText("loading")).toBeNull()

        view.unmount()
    })

    it("uses defaultFallback when no fallback prop is given, and the prop wins when there is one", async () => {
        const runtime = ReactRuntime.make(Layer.empty)

        const Slow = Component.make("Slow")(function*() {
            yield* Effect.sleep("30 millis")
            return <div>done</div>
        }).pipe(
            Async.async,
            Async.withOptions({ defaultFallback: <div>default fallback</div> }),
            Component.withContext(runtime.context),
        )

        const first = await renderAsync(
            <ReactRuntime.Provider runtime={runtime}>
                <Slow />
            </ReactRuntime.Provider>,
        )
        expect(screen.getByText("default fallback")).toBeTruthy()
        expect(await screen.findByText("done")).toBeTruthy()
        first.unmount()

        const second = await renderAsync(
            <ReactRuntime.Provider runtime={runtime}>
                <Slow fallback={<div>own fallback</div>} />
            </ReactRuntime.Provider>,
        )
        expect(screen.getByText("own fallback")).toBeTruthy()
        expect(screen.queryByText("default fallback")).toBeNull()
        expect(await screen.findByText("done")).toBeTruthy()

        second.unmount()
    })

    it("provides the component scope to the body and closes it after the component unmounts", async () => {
        const released = vi.fn()
        const runtime = ReactRuntime.make(Layer.empty)
        const managed = ManagedRuntime.make(ReactRuntime.preludeLayer)
        const context = await managed.context()
        const scopeRegistry = Context.get(context, ScopeRegistry.ScopeRegistry)

        const Resource = Component.make("Resource")(function*() {
            yield* Effect.addFinalizer(() => Effect.sync(released))
            yield* Effect.sleep("10 millis")
            return <div>resource</div>
        }).pipe(
            Async.async,
            Component.withOptions({ finalizerExecutionDebounce: "10 millis", scopeCommitTimeout: "50 millis" }),
            Component.withContext(runtime.context),
        )

        const view = await renderAsync(
            <runtime.context.Provider value={context}>
                <Resource />
            </runtime.context.Provider>,
        )

        await screen.findByText("resource")
        await new Promise(resolve => setTimeout(resolve, 40))
        expect(released).not.toHaveBeenCalled()
        expect(HashMap.size(Effect.runSync(Ref.get(scopeRegistry.ref)))).toBeGreaterThanOrEqual(1)

        view.unmount()
        await waitFor(() => expect(released).toHaveBeenCalled())
        await waitFor(() => expect(HashMap.size(Effect.runSync(Ref.get(scopeRegistry.ref)))).toBe(0))

        await managed.dispose()
    })

    it("keeps the scope of a mounted component alive after the commit timeout", async () => {
        const released = vi.fn()
        const runtime = ReactRuntime.make(Layer.empty)
        const managed = ManagedRuntime.make(ReactRuntime.preludeLayer)
        const context = await managed.context()
        const scopeRegistry = Context.get(context, ScopeRegistry.ScopeRegistry)

        const Resource = Component.make("CommittedResource")(function*() {
            yield* Effect.addFinalizer(() => Effect.sync(released))
            return <div>committed resource</div>
        }).pipe(
            Async.async,
            Component.withOptions({ finalizerExecutionDebounce: "10 millis", scopeCommitTimeout: "10 millis" }),
            Component.withContext(runtime.context),
        )

        const view = await renderAsync(
            <runtime.context.Provider value={context}>
                <Resource />
            </runtime.context.Provider>,
        )

        await screen.findByText("committed resource")
        await new Promise(resolve => setTimeout(resolve, 60))

        // Under StrictMode an abandoned scope from the discarded render is closed, but the committed one stays.
        expect(HashMap.size(Effect.runSync(Ref.get(scopeRegistry.ref)))).toBe(1)

        view.unmount()
        await waitFor(() => expect(HashMap.size(Effect.runSync(Ref.get(scopeRegistry.ref)))).toBe(0))
        await managed.dispose()
    })

    it("surfaces a failure of the effect to the nearest error boundary", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
        const runtime = ReactRuntime.make(Layer.empty)

        const Failing = Component.make("Failing")(function*() {
            yield* Effect.sleep("10 millis")
            return yield* Effect.fail("boom")
        }).pipe(
            Async.async,
            Component.withContext(runtime.context),
        )

        const view = await renderAsync(
            <ReactRuntime.Provider runtime={runtime}>
                <ErrorBoundary fallback={<div>something broke</div>}>
                    <Failing fallback={<div>loading</div>} />
                </ErrorBoundary>
            </ReactRuntime.Provider>,
        )

        expect(await screen.findByText("something broke")).toBeTruthy()

        view.unmount()
        consoleError.mockRestore()
    })

    it("runs the effect again with the new props when they change", async () => {
        const runtime = ReactRuntime.make(Layer.empty)

        const Item = Component.make("Item")(function*(props: { readonly id: number }) {
            yield* Effect.sleep("10 millis")
            return <div>item {props.id}</div>
        }).pipe(
            Async.async,
            Component.withContext(runtime.context),
        )

        const tree = (id: number) => (
            <ReactRuntime.Provider runtime={runtime}>
                <Item id={id} fallback={<div>loading</div>} />
            </ReactRuntime.Provider>
        )

        const view = await renderAsync(tree(1))
        expect(await screen.findByText("item 1")).toBeTruthy()

        await act(async () => { view.rerender(tree(2)) })
        expect(await screen.findByText("item 2")).toBeTruthy()
        expect(screen.queryByText("item 1")).toBeNull()

        view.unmount()
    })

    it("renders every item of a list independently", async () => {
        const runtime = ReactRuntime.make(Layer.empty)

        const Item = Component.make("ListItem")(function*(props: { readonly id: number }) {
            yield* Effect.sleep(`${5 + (props.id % 3) * 10} millis`)
            return <div>entry {props.id}</div>
        }).pipe(
            Async.async,
            Component.withContext(runtime.context),
        )

        const ids = Array.from({ length: 12 }, (_, id) => id)
        const view = await renderAsync(
            <ReactRuntime.Provider runtime={runtime}>
                {ids.map(id => <Item key={id} id={id} fallback={<span>waiting</span>} />)}
            </ReactRuntime.Provider>,
        )

        for (let id = 0; id < 12; id++)
            expect(await screen.findByText(`entry ${id}`)).toBeTruthy()
        expect(screen.queryByText("waiting")).toBeNull()

        view.unmount()
    })
})
