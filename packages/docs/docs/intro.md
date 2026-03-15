---
sidebar_position: 1
---

# Effect FC

Welcome to **Effect FC** (as in: Effect **F**unction **C**omponent) – a powerful integration of [Effect](https://effect.website/) with React 19.2+ that enables you to write React function components using Effect generators.

## What is Effect FC?

Effect FC allows you to harness the full power of Effect-TS within your React components. Instead of writing traditional React hooks, you can use Effect generators to compose complex, type-safe component logic with built-in error handling, resource management, and dependency injection.

### Key Features

- **Effect Integration**: Write your function component logic using Effect.
- **Type Safety**: Full TypeScript support with Effect's comprehensive type system
- **Dependency Injection**: Built-in support for providing dependencies to components using Effect services.
- **Resource Management**: Automatic cleanup and finalization of component resources using the `Scope` API.

## Quick Example

Here's what writing an Effect FC component looks like:

```typescript
export class TodosView extends Component.make("TodosView")(function*() {
    const state = yield* TodosState
    const [todos] = yield* Component.useSubscribables([state.subscriptionRef])

    yield* Component.useOnMount(() => Effect.andThen(
        Console.log("Todos mounted"),
        Effect.addFinalizer(() => Console.log("Todos unmounted")),
    ))

    const Todo = yield* TodoView.use

    return (
        <Container>
            <Heading align="center">Todos</Heading>

            <Flex direction="column" align="stretch" gap="2" mt="2">
                <Todo _tag="new" />

                {Chunk.map(todos, todo =>
                    <Todo key={todo.id} _tag="edit" id={todo.id} />
                )}
            </Flex>
        </Container>
    )
}) {}

const Index = Component.make("IndexView")(function*() {
    const context = yield* Component.useContextFromLayer(TodosState.Default)
    const Todos = yield* Effect.provide(TodosView.use, context)

    return <Todos />
}).pipe(
    Component.withRuntime(runtime.context)
)

export const Route = createFileRoute("/")({
    component: Index
})
```

## Getting Started

### Prerequisites

Before using Effect FC, make sure you have:

- **Node.js** version 20.0 or above
- **React** 19.2 or higher
- **Effect** 3.19 or higher

### Installation

Install Effect FC and its peer dependencies:

```bash
npm install effect-fc effect react
```

Or with your preferred package manager:

```bash
yarn add effect-fc effect react
bun add effect-fc effect react
pnpm add effect-fc effect react
```

### Next Steps

- Explore the [Tutorial Basics](./tutorial-basics/create-a-document.md) to learn the fundamentals
- Check out the [Example Project](https://github.com/your-repo/packages/example) for a complete working application

## Important Notes

:::info Early Development
This library is in early development. While it is mostly feature-complete and usable, expect bugs and quirks. Things are still being ironed out, so ideas and criticisms are welcome!
:::

:::warning Known Issues
- React Refresh doesn't work for Effect FC components yet. Page reload is required to view changes. Regular React components are unaffected.
:::

## Community & Support

Have questions or want to contribute? We'd love to hear from you! Check out the project repository and feel free to open issues or discussions.
