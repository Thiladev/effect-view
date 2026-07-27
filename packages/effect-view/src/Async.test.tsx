import { act, fireEvent, render, screen } from "@testing-library/react"
import { Effect, Layer } from "effect"
import * as React from "react"
import { describe, expect, it, vi } from "vitest"
import * as Async from "./Async.js"
import * as Component from "./Component.js"
import * as Memoized from "./Memoized.js"
import * as ReactRuntime from "./ReactRuntime.js"

describe("Async", () => {
    it("does not rerun for an unrelated parent state update", async () => {
        const load = vi.fn((_id: number) => Effect.never)
        const renderPost = vi.fn()
        const runtime = ReactRuntime.make(Layer.empty)
        const context = await runtime.runtime.context()

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
                <runtime.context.Provider value={context}>
                    <Parent />
                </runtime.context.Provider>,
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
        await runtime.runtime.dispose()
    })
})
