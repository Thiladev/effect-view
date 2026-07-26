import { Container, Flex, Heading, Slider, Text, TextField } from "@radix-ui/themes"
import { createFileRoute } from "@tanstack/react-router"
import { Console, Effect } from "effect"
import { Async, Component, Memoized } from "effect-fc-next"
import * as React from "react"
import { runtime } from "@/runtime"


const fetchPost = (id: number) => Effect.sleep("500 millis").pipe(
    Effect.as({
        title: `Post ${id}`,
        body: `This is the content of post ${id}.`,
    }),
)


interface AsyncFetchPostViewProps {
    readonly id: number
}

const AsyncFetchPostView = Component.make("AsyncFetchPostView")(function*(
    props: AsyncFetchPostViewProps,
) {
    yield* Component.useOnMount(() => Effect.gen(function*() {
        yield* Effect.addFinalizer(() => Console.log("AsyncFetchPostView unmounted"))
        yield* Console.log("AsyncFetchPostView mounted")
    }))

    const post = yield* Component.useOnChange(
        () => fetchPost(props.id),
        [props.id],
    )

    return (
        <div>
            <Heading>{post.title}</Heading>
            <Text>{post.body}</Text>
        </div>
    )
}).pipe(
    Async.async,
    Async.withOptions({ defaultFallback: <Text>Loading post...</Text> }),
    Memoized.memoized,
)

const AsyncRouteComponent = Component.make("AsyncRouteView")(function*() {
    const [text, setText] = React.useState("Typing here should not trigger a refetch of the post")
    const [id, setId] = React.useState(1)

    const AsyncFetchPost = yield* AsyncFetchPostView.use

    return (
        <Container>
            <Flex direction="column" align="stretch" gap="2">
                <TextField.Root
                    value={text}
                    onChange={event => setText(event.currentTarget.value)}
                />

                <Slider
                    value={[id]}
                    min={1}
                    max={10}
                    onValueChange={([value]) => setId(value ?? 1)}
                />

                <AsyncFetchPost id={id} />
            </Flex>
        </Container>
    )
}).pipe(
    Component.withContext(runtime.context),
)

export const Route = createFileRoute("/async")({
    component: AsyncRouteComponent,
})
