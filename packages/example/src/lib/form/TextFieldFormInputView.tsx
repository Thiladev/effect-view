import { Callout, Flex, Spinner, TextField } from "@radix-ui/themes"
import { Array, Option, Struct } from "effect"
import { Component, Form, View } from "effect-view"
import type * as React from "react"


export declare namespace TextFieldFormInputView {
    export interface Props<out P extends readonly PropertyKey[], A, ER, EW>
    extends Omit<TextField.RootProps, "form">, Form.useInput.Options {
        readonly form: Form.Form<P, A, string, ER, EW>
    }

    export type Signature = <P extends readonly PropertyKey[], A, ER, EW>(props: Props<P, A, ER, EW>) => React.ReactNode
}

export const TextFieldFormInputView = Component.make("TextFieldFormInputView")(function*(
    props: TextFieldFormInputView.Props<readonly PropertyKey[], any, any, any>
) {
    const input = yield* Form.useInput(props.form, props)
    const [issues, isValidating, isCommitting] = yield* View.useAll([
        props.form.issues,
        props.form.isValidating,
        props.form.isCommitting,
    ])

    return (
        <Flex direction="column" gap="1">
            <TextField.Root
                value={input.value}
                onChange={e => input.setValue(e.target.value)}
                disabled={isCommitting}
                {...Struct.omit(props, ["form"])}
            >
                {isValidating &&
                    <TextField.Slot side="right">
                        <Spinner />
                    </TextField.Slot>
                }

                {props.children}
            </TextField.Root>

            {Option.match(Array.head(issues), {
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
    Component.withSignature<TextFieldFormInputView.Signature>()
)
