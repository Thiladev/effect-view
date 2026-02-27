import { KeyValueStore } from "@effect/platform"
import { BrowserKeyValueStore } from "@effect/platform-browser"
import { Chunk, Console, Effect, Option, Schema, Stream, SubscriptionRef } from "effect"
import { Subscribable, SubscriptionSubRef } from "effect-fc"
import { Todo } from "@/domain"


export class TodosState extends Effect.Service<TodosState>()("TodosState", {
    scoped: Effect.fnUntraced(function*(key: string) {
        const kv = yield* KeyValueStore.KeyValueStore

        const readFromLocalStorage = Console.log("Reading todos from local storage...").pipe(
            Effect.andThen(kv.get(key)),
            Effect.andThen(Option.match({
                onSome: Schema.decode(
                    Schema.parseJson(Schema.Chunk(Todo.TodoFromJson))
                ),
                onNone: () => Effect.succeed(Chunk.empty()),
            }))
        )
        const saveToLocalStorage = (todos: Chunk.Chunk<Todo.Todo>) => Effect.andThen(
            Console.log("Saving todos to local storage..."),
            Chunk.isNonEmpty(todos)
                ? Effect.andThen(
                    Schema.encode(
                        Schema.parseJson(Schema.Chunk(Todo.TodoFromJson))
                    )(todos),
                    v => kv.set(key, v),
                )
                : kv.remove(key)
        )

        const ref = yield* SubscriptionRef.make(yield* readFromLocalStorage)
        yield* Effect.forkScoped(ref.changes.pipe(
            Stream.debounce("500 millis"),
            Stream.runForEach(saveToLocalStorage),
        ))
        yield* Effect.addFinalizer(() => ref.pipe(
            Effect.andThen(saveToLocalStorage),
            Effect.ignore,
        ))

        const sizeSubscribable = Subscribable.make({
            get: Effect.andThen(ref, Chunk.size),
            get changes() { return Stream.map(ref.changes, Chunk.size) },
        })
        const getElementRef = (id: string) => SubscriptionSubRef.makeFromChunkFindFirst(ref, v => v.id === id)
        const getIndexSubscribable = (id: string) => Subscribable.make({
            get: Effect.flatMap(ref, Chunk.findFirstIndex(v => v.id === id)),
            get changes() { return Stream.flatMap(ref.changes, Chunk.findFirstIndex(v => v.id === id)) },
        })

        const moveLeft = (id: string) => SubscriptionRef.updateEffect(ref, todos => Effect.Do.pipe(
            Effect.bind("index", () => Chunk.findFirstIndex(todos, v => v.id === id)),
            Effect.bind("todo", ({ index }) => Chunk.get(todos, index)),
            Effect.bind("previous", ({ index }) => Chunk.get(todos, index - 1)),
            Effect.andThen(({ todo, index, previous }) => index > 0
                ? todos.pipe(
                    Chunk.replace(index, previous),
                    Chunk.replace(index - 1, todo),
                )
                : todos
            ),
        ))
        const moveRight = (id: string) => SubscriptionRef.updateEffect(ref, todos => Effect.Do.pipe(
            Effect.bind("index", () => Chunk.findFirstIndex(todos, v => v.id === id)),
            Effect.bind("todo", ({ index }) => Chunk.get(todos, index)),
            Effect.bind("next", ({ index }) => Chunk.get(todos, index + 1)),
            Effect.andThen(({ todo, index, next }) => index < Chunk.size(todos) - 1
                ? todos.pipe(
                    Chunk.replace(index, next),
                    Chunk.replace(index + 1, todo),
                )
                : todos
            ),
        ))
        const remove = (id: string) => SubscriptionRef.updateEffect(ref, todos => Effect.andThen(
            Chunk.findFirstIndex(todos, v => v.id === id),
            index => Chunk.remove(todos, index),
        ))

        return {
            ref,
            sizeSubscribable,
            getElementRef,
            getIndexSubscribable,
            moveLeft,
            moveRight,
            remove,
        } as const
    }),

    dependencies: [BrowserKeyValueStore.layerLocalStorage],
}) {}
