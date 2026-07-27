import { HttpClient, type HttpClientError } from "@effect/platform"
import { Container, Heading, Text } from "@radix-ui/themes"
import { createFileRoute } from "@tanstack/react-router"
import { Cause, Chunk, Console, Effect, flow, Match, Option, Schema, Stream } from "effect"
import { Component, ErrorObserver, Result, Subscribable } from "effect-fc"
import { runtime } from "@/runtime"


const Post = Schema.Struct({
    userId: Schema.Int,
    id: Schema.Int,
    title: Schema.String,
    body: Schema.String,
})

const ResultView = Component.makeUntraced("Result")(function*() {
    const [resultSubscribable] = yield* Component.useOnMount(() => HttpClient.HttpClient.pipe(
        Effect.andThen(client => client.get("https://jsonplaceholder.typicode.com/posts/1")),
        Effect.andThen(response => response.json),
        Effect.andThen(Schema.decodeUnknown(Post)),
        Effect.tap(Effect.sleep("250 millis")),
        Result.forkEffect,
    ))
    const [result] = yield* Subscribable.useAll([resultSubscribable])

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
            {Match.value(result).pipe(
                Match.tag("Running", () => <Text>Loading...</Text>),
                Match.tag("Success", result => <>
                    <Heading>{result.value.title}</Heading>
                    <Text>{result.value.body}</Text>
                </>),
                Match.tag("Failure", result =>
                    <Text>An error has occured: {result.cause.toString()}</Text>
                ),
                Match.orElse(() => <></>),
            )}
        </Container>
    )
})

export const Route = createFileRoute("/result")({
    component: Component.withRuntime(ResultView, runtime.context)
})
