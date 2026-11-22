import { Callout, Flex, Spinner, TextField } from "@radix-ui/themes"
import { Array, Option, Struct } from "effect"
import { Component, Form, View } from "effect-view"
import type * as React from "react"


export declare namespace TextFieldFormBufferedInputView {
    export interface Props<out P extends readonly PropertyKey[], A, ER, EW>
    extends Omit<TextField.RootProps, "form"> {
        readonly form: Form.Form<P, A, string, ER, EW>
    }

    export type Signature = <P extends readonly PropertyKey[], A, ER, EW>(props: Props<P, A, ER, EW>) => React.ReactNode
}

export const TextFieldFormBufferedInputView = Component.make("TextFieldFormBufferedInputView")(function*(
    props: TextFieldFormBufferedInputView.Props<readonly PropertyKey[], any, any, any>
) {
    const input = yield* Form.useBufferedInput(props.form)
    const status = yield* Form.useStatus(props.form)
    const [issues] = yield* View.useAll([props.form.issues])

    return (
        <Flex direction="column" gap="1">
            <TextField.Root
                value={input.value}
                onChange={e => input.setValue(e.target.value)}
                onBlur={input.flush}
                disabled={status.isCommitting}
                {...Struct.omit(props, ["form"])}
            >
                {status.isValidating &&
                    <TextField.Slot side="right">
                        <Spinner />
                    </TextField.Slot>
                }

                {props.children}
            </TextField.Root>

            {input.flushed && Option.match(Array.head(issues), {
                onSome: issue => (
                    <Callout.Root>
                        <Callout.Text>{issue.message}</Callout.Text>
                    </Callout.Root>
                ),

                onNone: () => <></>,
            })}
        </Flex>
    )
}).pipe(
    Component.withSignature<TextFieldFormBufferedInputView.Signature>(),
)
