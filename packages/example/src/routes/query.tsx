import { HttpClient, type HttpClientError } from "@effect/platform"
import { Button, Container, Flex, Heading, Slider, Text } from "@radix-ui/themes"
import { createFileRoute } from "@tanstack/react-router"
import { Array, Cause, Chunk, Console, Effect, flow, Match, Option, Schema, Stream } from "effect"
import { Component, ErrorObserver, Mutation, Query, Result, Subscribable, SubscriptionRef } from "effect-fc"
import { runtime } from "@/runtime"


const Post = Schema.Struct({
    userId: Schema.Int,
    id: Schema.Int,
    title: Schema.String,
    body: Schema.String,
})

const ResultView = Component.make("ResultView")(function*() {
    const runPromise = yield* Component.useRunPromise()

    const [idRef, query, mutation] = yield* Component.useOnMount(() => Effect.gen(function*() {
        const idRef = yield* SubscriptionRef.make(1)
        const key = Stream.map(idRef.changes, id => [id] as const)

        const query = yield* Query.service({
            key,
            f: ([id]) => HttpClient.HttpClient.pipe(
                Effect.tap(Effect.sleep("500 millis")),
                Effect.andThen(client => client.get(`https://jsonplaceholder.typicode.com/posts/${ id }`)),
                Effect.andThen(response => response.json),
                Effect.andThen(Schema.decodeUnknown(Post)),
            ),
            staleTime: "10 seconds",
        })

        const mutation = yield* Mutation.make({
            f: ([id]: readonly [id: number]) => HttpClient.HttpClient.pipe(
                Effect.tap(Effect.sleep("500 millis")),
                Effect.andThen(client => client.get(`https://jsonplaceholder.typicode.com/posts/${ id }`)),
                Effect.andThen(response => response.json),
                Effect.andThen(Schema.decodeUnknown(Post)),
            ),
        })

        return [idRef, query, mutation] as const
    }))

    const [id, setId] = yield* SubscriptionRef.useSubscriptionRefState(idRef)
    const [queryResult, mutationResult] = yield* Subscribable.useSubscribables([query.result, mutation.result])

    yield* Component.useOnMount(() => ErrorObserver.ErrorObserver<HttpClientError.HttpClientError>().pipe(
        Effect.andThen(observer => observer.subscribe),
        Effect.andThen(Stream.fromQueue),
        Stream.unwrapScoped,
        Stream.runForEach(flow(
            Cause.failures,
            Chunk.findFirst(e => e._tag === "RequestError" || e._tag === "ResponseError"),
            Option.match({
                onSome: e => Console.log("ResultView HttpClient error", e),
                onNone: () => Effect.void,
            }),
        )),
        Effect.forkScoped,
    ))

    return (
        <Container>
            <Flex direction="column" align="center" gap="2">
                <Slider
                    value={[id]}
                    onValueChange={flow(Array.head, Option.getOrThrow, setId)}
                />

                <div>
                    {Match.value(queryResult).pipe(
                        Match.tag("Running", () => <Text>Loading...</Text>),
                        Match.tag("Success", result => <>
                            <Heading>{result.value.title}</Heading>
                            <Text>{result.value.body}</Text>
                            {Result.hasRefreshingFlag(result) && <Text>Refreshing...</Text>}
                        </>),
                        Match.tag("Failure", result =>
                            <Text>An error has occured: {result.cause.toString()}</Text>
                        ),
                        Match.orElse(() => <></>),
                    )}
                </div>

                <Flex direction="row" justify="center" align="center" gap="1">
                    <Button onClick={() => runPromise(query.refresh)}>Refresh</Button>
                    <Button onClick={() => runPromise(query.invalidateCache)}>Invalidate cache</Button>
                </Flex>

                <div>
                    {Match.value(mutationResult).pipe(
                        Match.tag("Running", () => <Text>Loading...</Text>),
                        Match.tag("Success", result => <>
                            <Heading>{result.value.title}</Heading>
                            <Text>{result.value.body}</Text>
                            {Result.hasRefreshingFlag(result) && <Text>Refreshing...</Text>}
                        </>),
                        Match.tag("Failure", result =>
                            <Text>An error has occured: {result.cause.toString()}</Text>
                        ),
                        Match.orElse(() => <></>),
                    )}
                </div>

                <Flex direction="row" justify="center" align="center" gap="1">
                    <Button onClick={() => runPromise(Effect.andThen(idRef, id => mutation.mutate([id])))}>Mutate</Button>
                </Flex>
            </Flex>
        </Container>
    )
})

export const Route = createFileRoute("/query")({
    component: Component.withRuntime(ResultView, runtime.context)
})
