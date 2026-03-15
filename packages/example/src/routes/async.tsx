import { HttpClient } from "@effect/platform"
import { Container, Flex, Heading, Slider, Text, TextField } from "@radix-ui/themes"
import { createFileRoute } from "@tanstack/react-router"
import { Array, Effect, flow, Option, Schema } from "effect"
import { Async, Component, Memoized } from "effect-fc"
import * as React from "react"
import { runtime } from "@/runtime"


const Post = Schema.Struct({
    userId: Schema.Int,
    id: Schema.Int,
    title: Schema.String,
    body: Schema.String,
})

interface AsyncFetchPostViewProps {
    readonly id: number
}

class AsyncFetchPostView extends Component.make("AsyncFetchPostView")(function*(props: AsyncFetchPostViewProps) {
    const post = yield* Component.useOnChange(() => HttpClient.HttpClient.pipe(
        Effect.tap(Effect.sleep("500 millis")),
        Effect.andThen(client => client.get(`https://jsonplaceholder.typicode.com/posts/${ props.id }`)),
        Effect.andThen(response => response.json),
        Effect.andThen(Schema.decodeUnknown(Post)),
    ), [props.id])

    return (
        <div>
            <Heading>{post.title}</Heading>
            <Text>{post.body}</Text>
        </div>
    )
}).pipe(
    Async.async,
    Async.withOptions({ defaultFallback: <Text>Default fallback</Text> }),
    Memoized.memoized,
) {}


const AsyncRouteComponent = Component.make("AsyncRouteView")(function*() {
    const [text, setText] = React.useState("Typing here should not trigger a refetch of the post")
    const [id, setId] = React.useState(1)

    const AsyncFetchPost = yield* AsyncFetchPostView.use

    return (
        <Container>
            <Flex direction="column" align="stretch" gap="2">
                <TextField.Root
                    value={text}
                    onChange={e => setText(e.currentTarget.value)}
                />

                <Slider
                    value={[id]}
                    onValueChange={flow(Array.head, Option.getOrThrow, setId)}
                />

                <AsyncFetchPost id={id} fallback={<Text>Loading post...</Text>} />
            </Flex>
        </Container>
    )
}).pipe(
    Component.withRuntime(runtime.context)
)

export const Route = createFileRoute("/async")({
    component: AsyncRouteComponent,
})
