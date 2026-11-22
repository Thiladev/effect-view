import { Callout, Flex, Spinner, Switch, TextField } from "@radix-ui/themes"
import { Array, Option, Struct } from "effect"
import { Component, Form, View } from "effect-view"
import type * as React from "react"


export declare namespace TextFieldOptionalFormBufferedInputView {
    export interface Props<out P extends readonly PropertyKey[], A, ER, EW>
    extends Omit<TextField.RootProps, "form" | "defaultValue">, Form.useOptionalBufferedInput.Options<string> {
        readonly form: Form.Form<P, A, Option.Option<string>, ER, EW>
    }

    export type Signature = <P extends readonly PropertyKey[], A, ER, EW>(props: Props<P, A, ER, EW>) => React.ReactNode
}

export const TextFieldOptionalFormBufferedInputView = Component.make("TextFieldOptionalFormBufferedInputView")(function*(
    props: TextFieldOptionalFormBufferedInputView.Props<readonly PropertyKey[], any, any, any>
) {
    const input = yield* Form.useOptionalBufferedInput(props.form, props)
    const status = yield* Form.useStatus(props.form)
    const [issues] = yield* View.useAll([props.form.issues])

    return (
        <Flex direction="column" gap="1">
            <TextField.Root
                value={input.value}
                onChange={e => input.setValue(e.target.value)}
                onBlur={input.flush}
                disabled={!input.enabled || status.isCommitting}
                {...Struct.omit(props, ["form", "defaultValue"])}
            >
                <TextField.Slot side="left">
                    <Switch
                        size="1"
                        checked={input.enabled}
                        onCheckedChange={input.setEnabled}
                    />
                </TextField.Slot>

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
    Component.withSignature<TextFieldOptionalFormBufferedInputView.Signature>(),
)
