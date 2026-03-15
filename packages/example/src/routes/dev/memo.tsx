import { Flex, Text, TextField } from "@radix-ui/themes"
import { createFileRoute } from "@tanstack/react-router"
import { GetRandomValues, makeUuid4 } from "@typed/id"
import { Effect } from "effect"
import { Component, Memoized } from "effect-fc"
import * as React from "react"
import { runtime } from "@/runtime"


const RouteComponent = Component.makeUntraced("RouteComponent")(function*() {
    const [value, setValue] = React.useState("")

    return (
        <Flex direction="column" gap="2">
            <TextField.Root
                value={value}
                onChange={e => setValue(e.target.value)}
            />

            {yield* Effect.map(SubComponent.use, FC => <FC />)}
            {yield* Effect.map(MemoizedSubComponent.use, FC => <FC />)}
        </Flex>
    )
}).pipe(
    Component.withRuntime(runtime.context)
)

class SubComponent extends Component.makeUntraced("SubComponent")(function*() {
    const id = yield* makeUuid4.pipe(Effect.provide(GetRandomValues.CryptoRandom))
    return <Text>{id}</Text>
}) {}

class MemoizedSubComponent extends Memoized.memoized(SubComponent) {}

export const Route = createFileRoute("/dev/memo")({
    component: RouteComponent,
})
