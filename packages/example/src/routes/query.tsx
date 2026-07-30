import { Button, Container, Flex, Heading, Slider, Text } from "@radix-ui/themes"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, Schema, SubscriptionRef } from "effect"
import { HttpClient } from "effect/unstable/http"
import { AsyncResult } from "effect/unstable/reactivity"
import { Component, Lens, Mutation, Query, View } from "effect-view"
import { runtime } from "@/runtime"


const Post = Schema.Struct({
    userId: Schema.Int,
    id: Schema.Int,
    title: Schema.String,
    body: Schema.String,
})


interface PostResultViewProps {
    readonly result: AsyncResult.AsyncResult<typeof Post.Type, Error>
}

const PostResultView = (props: PostResultViewProps) => AsyncResult.match(props.result, {
    onInitial: result => result.waiting
        ? <Text>Loading...</Text>
        : <Text>No data.</Text>,
    onFailure: result => <Text>Request failed: { result.cause.toString() }</Text>,
    onSuccess: result => <>
        {result.waiting && <Text>Refreshing...</Text>}
        <Heading>{result.value.title}</Heading>
        <Text>{result.value.body}</Text>
    </>,
})

const QueryRouteComponent = Component.make("QueryRouteView")(function*() {
    const [idLens, query, mutation] = yield* Component.useOnMount(() => Effect.gen(function*() {
        const keyLens = Lens.fromSubscriptionRef(yield* SubscriptionRef.make(["post", 1 as number] as const))
        const idLens = Lens.focusTupleAt(keyLens, 1)

        const query = yield* Query.make({
            key: keyLens,
            f: ([, id]) => HttpClient.HttpClient.pipe(
                Effect.tap(Effect.sleep("500 millis")),
                Effect.flatMap(client => client.get(`https://jsonplaceholder.typicode.com/posts/${ id }`)),
                Effect.flatMap(response => response.json),
                Effect.flatMap(Schema.decodeUnknownEffect(Post)),
            ),
            staleTime: "10 seconds",
        }).pipe(
            Query.thenRun,
        )

        const mutation = yield* Mutation.make({
            f: ([id]: [id: number]) => HttpClient.HttpClient.pipe(
                Effect.tap(Effect.sleep("1 second")),
                Effect.andThen(client => client.get(`https://jsonplaceholder.typicode.com/posts/${ id }`)),
                Effect.andThen(response => response.json),
                Effect.andThen(Schema.decodeUnknownEffect(Post)),
            ),
        })

        return [idLens, query, mutation] as const
    }))

    const [id, setId] = yield* Lens.useState(idLens)
    const [queryState, mutationState] = yield* View.useAll([query.state, mutation.state])

    const runSync = yield* Component.useRunSync()

    return (
        <Container>
            <Flex direction="column" align="center" gap="2">
                <Slider
                    value={[id]}
                    min={1}
                    max={10}
                    onValueChange={([value]) => setId(value ?? 1)}
                />

                <PostResultView result={queryState.result} />

                <Flex direction="row" justify="center" align="center" gap="1">
                    <Button onClick={() => runSync(query.refreshView)}>
                        Refresh
                    </Button>
                    <Button onClick={() => runSync(query.invalidateCache)}>
                        Invalidate cache
                    </Button>
                </Flex>

                <PostResultView result={mutationState} />

                <Button onClick={() => runSync(mutation.mutateView([id]))}>
                    Mutate
                </Button>
            </Flex>
        </Container>
    )
}).pipe(
    Component.withContext(runtime.context),
)

export const Route = createFileRoute("/query")({
    component: QueryRouteComponent,
})
