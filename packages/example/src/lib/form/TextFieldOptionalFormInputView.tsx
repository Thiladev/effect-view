import { Callout, Flex, Spinner, Switch, TextField } from "@radix-ui/themes"
import { Array, Option, Struct } from "effect"
import { Component, Form, View } from "effect-view"
import type * as React from "react"


export declare namespace TextFieldOptionalFormInputView {
    export interface Props<out P extends readonly PropertyKey[], A, ER, EW>
    extends Omit<TextField.RootProps, "form" | "defaultValue">, Form.useOptionalInput.Options<string> {
        readonly form: Form.Form<P, A, Option.Option<string>, ER, EW>
    }

    export type Signature = <P extends readonly PropertyKey[], A, ER, EW>(props: Props<P, A, ER, EW>) => React.ReactNode
}

export const TextFieldOptionalFormInputView = Component.make("TextFieldOptionalFormInputView")(function*(
    props: TextFieldOptionalFormInputView.Props<readonly PropertyKey[], any, any, any>
) {
    const input = yield* Form.useOptionalInput(props.form, props)
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
                disabled={!input.enabled || isCommitting}
                {...Struct.omit(props, ["form", "defaultValue"])}
            >
                <TextField.Slot side="left">
                    <Switch
                        size="1"
                        checked={input.enabled}
                        onCheckedChange={input.setEnabled}
                    />
                </TextField.Slot>

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
    Component.withSignature<TextFieldOptionalFormInputView.Signature>()
)
