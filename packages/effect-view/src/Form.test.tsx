import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Effect, Layer, Option, Schema, type Scope } from "effect"
import type * as React from "react"
import { describe, expect, it, vi } from "vitest"
import * as AppConnectivity from "./AppConnectivity.js"
import * as AppFocus from "./AppFocus.js"
import * as Component from "./Component.js"
import * as Form from "./Form.js"
import * as MutationForm from "./MutationForm.js"
import * as QueryClient from "./QueryClient.js"
import * as ReactRuntime from "./ReactRuntime.js"
import * as View from "./View.js"


const runtime = ReactRuntime.make(QueryClient.layer.pipe(
    Layer.provide(Layer.mergeAll(AppConnectivity.layerDummy, AppFocus.layerDummy)),
))

const Schema_ = Schema.Struct({
    email: Schema.String.check(Schema.isPattern(/^[^\s@]+@[^\s@]+$/, { message: "Enter a valid email address" })),
})

interface EmailInput {
    readonly value: string
    readonly setValue: React.Dispatch<React.SetStateAction<string>>
    readonly flush: () => Promise<void>
    readonly flushed: boolean
}

type UseEmailInput = (field: Form.Form<readonly ["email"], string, string>) => Effect.Effect<EmailInput, never, Scope.Scope>

describe("Form.useLiveInput, Form.useBufferedInput", () => {
    const setup = (useEmailInput: UseEmailInput) => {
        const submitted = vi.fn<(email: string) => void>()

        const Probe = Component.make("FormProbe")(function*() {
            const [form, emailField] = yield* Component.useOnMount(() => Effect.gen(function*() {
                const form = yield* MutationForm.make({
                    schema: Schema_,
                    initialEncodedValue: { email: "" },
                    f: ([value]) => Effect.sync(() => submitted(value.email)),
                }).pipe(MutationForm.thenRun)
                return [form, Form.focusObjectOn(form, "email")] as const
            }))

            const input = yield* useEmailInput(emailField)
            const [issues, encodedValue] = yield* View.useAll([form.issues, form.encodedValue])
            const runPromise = yield* Component.useRunPromise()

            return (
                <form onSubmit={e => { e.preventDefault(); void runPromise(Effect.ignore(form.submit)) }}>
                    <input
                        aria-label="email"
                        value={input.value}
                        onChange={e => input.setValue(e.currentTarget.value)}
                        onBlur={input.flush}
                    />
                    <p data-testid="flushed">{String(input.flushed)}</p>
                    <p data-testid="encoded">{encodedValue.email}</p>
                    <p data-testid="issue">{Option.getOrElse(Option.map(Option.fromNullishOr(issues[0]), i => i.message), () => "none")}</p>
                    <p data-testid="shown-issue">{input.flushed ? Option.getOrElse(Option.map(Option.fromNullishOr(issues[0]), i => i.message), () => "none") : "none"}</p>
                    <button type="submit">submit</button>
                </form>
            )
        }).pipe(Component.withContext(runtime.context))

        const mount = async () => {
            let view!: ReturnType<typeof render>
            await act(async () => {
                view = render(<ReactRuntime.AsyncProvider runtime={runtime}><Probe /></ReactRuntime.AsyncProvider>)
            })
            return view
        }

        return { mount, submitted }
    }

    const type = async (value: string) => {
        await act(async () => { fireEvent.change(screen.getByLabelText("email"), { target: { value } }) })
    }

    it("validates on every change by default", async () => {
        const { mount } = setup(Form.useLiveInput)
        const view = await mount()

        await waitFor(() => expect(screen.getByTestId("issue").textContent).toBe("Enter a valid email address"))
        await type("a@b")
        await waitFor(() => expect(screen.getByTestId("issue").textContent).toBe("none"))
        view.unmount()
    })

    it("useLiveInput writes a value that is still debounced when the form is submitted", async () => {
        const { mount, submitted } = setup(field => Form.useLiveInput(field, { debounce: "10 seconds" }))
        const view = await mount()

        await type("a@b")
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "submit" })) })

        await waitFor(() => expect(submitted).toHaveBeenCalledWith("a@b"))
        view.unmount()
    })

    it("useLiveInput is flushed once flush is called", async () => {
        const { mount } = setup(Form.useLiveInput)
        const view = await mount()

        await type("a")
        expect(screen.getByTestId("flushed").textContent).toBe("false")

        await act(async () => { fireEvent.blur(screen.getByLabelText("email")) })
        await waitFor(() => expect(screen.getByTestId("flushed").textContent).toBe("true"))
        view.unmount()
    })

    it("useBufferedInput is flushed once flush is called", async () => {
        const { mount } = setup(Form.useBufferedInput)
        const view = await mount()

        await type("a")
        expect(screen.getByTestId("flushed").textContent).toBe("false")

        await act(async () => { fireEvent.blur(screen.getByLabelText("email")) })
        await waitFor(() => expect(screen.getByTestId("flushed").textContent).toBe("true"))
        view.unmount()
    })

    it("the inputs are flushed when the form is submitted", async () => {
        const live = setup(Form.useLiveInput)
        const liveView = await live.mount()
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "submit" })) })
        await waitFor(() => expect(screen.getByTestId("flushed").textContent).toBe("true"))
        liveView.unmount()

        const buffered = setup(Form.useBufferedInput)
        const bufferedView = await buffered.mount()
        expect(screen.getByTestId("flushed").textContent).toBe("false")
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "submit" })) })
        await waitFor(() => expect(screen.getByTestId("flushed").textContent).toBe("true"))
        bufferedView.unmount()
    })

    it("useBufferedInput holds the value back until flushed", async () => {
        const { mount } = setup(Form.useBufferedInput)
        const view = await mount()

        await type("a@b")
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })
        expect(screen.getByTestId("encoded").textContent).toBe("")
        expect(screen.getByTestId("issue").textContent).toBe("Enter a valid email address")

        await act(async () => { fireEvent.blur(screen.getByLabelText("email")) })
        await waitFor(() => expect(screen.getByTestId("encoded").textContent).toBe("a@b"))
        await waitFor(() => expect(screen.getByTestId("issue").textContent).toBe("none"))
        view.unmount()
    })

    it("submitting a pristine invalid form flushes the inputs and shows their issues", async () => {
        for (const hook of [Form.useBufferedInput, Form.useLiveInput]) {
            const { mount, submitted } = setup(hook)
            const view = await mount()
            expect(screen.getByTestId("shown-issue").textContent).toBe("none")

            await act(async () => { fireEvent.click(screen.getByRole("button", { name: "submit" })) })

            await waitFor(() => expect(screen.getByTestId("shown-issue").textContent).toBe("Enter a valid email address"))
            expect(submitted).not.toHaveBeenCalled()
            view.unmount()
        }
    })

    it("useBufferedInput writes the value when the form is submitted without a flush", async () => {
        const { mount, submitted } = setup(Form.useBufferedInput)
        const view = await mount()

        await type("a@b")
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "submit" })) })

        await waitFor(() => expect(submitted).toHaveBeenCalledWith("a@b"))
        view.unmount()
    })

    it("useBufferedInput does not submit an invalid value", async () => {
        const { mount, submitted } = setup(Form.useBufferedInput)
        const view = await mount()

        await type("nope")
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "submit" })) })

        await waitFor(() => expect(screen.getByTestId("issue").textContent).toBe("Enter a valid email address"))
        expect(submitted).not.toHaveBeenCalled()
        view.unmount()
    })
})
