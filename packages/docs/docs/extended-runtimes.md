---
sidebar_position: 6
title: Extended Runtimes
---

# Extended Runtimes

`Component.provide` and `Component.useLayer` give services to the Effect View
components rendered below a component. That is not enough with a React router:
the router renders the routes itself, so a route is a plain React component
created with `Component.withContext`, and it reads the root runtime. A `/user`
layout cannot give services to `/user/edit` by wrapping it.

`runtime.extend` creates an extended runtime: the services of a parent runtime
plus those of an additional layer, for one subtree of the application. You
render its provider around the subtree, and the routes below read its context.

## Extend a runtime

Call `extend` on the runtime, or on another extended runtime, with the layer
that adds the services. Declare the result at module scope, like the runtime
itself:

```ts title="src/user.ts"
import { Console, Context, Effect, Layer, SubscriptionRef } from "effect"
import { Lens } from "effect-view"
import { runtime } from "./runtime"

export class CurrentUser extends Context.Service<CurrentUser, {
  readonly name: Lens.Lens<string>
}>()("CurrentUser") {
  static readonly layer = Layer.effect(CurrentUser, Effect.gen(function* () {
    yield* Effect.addFinalizer(() => Console.log("CurrentUser released"))

    return {
      name: Lens.fromSubscriptionRef(yield* SubscriptionRef.make("Ada")),
    }
  }))
}

export const userRuntime = runtime.extend(CurrentUser.layer)
```

The layer can require services of the parent runtime.

## Provide it to the subtree

Render the provider of the extended runtime around the part of the application
that needs the services, below the provider of its parent. With TanStack
Router, that is the layout route of the subtree:

```tsx title="src/routes/user.tsx"
import { createFileRoute, Link, Outlet } from "@tanstack/react-router"
import { ReactRuntime } from "effect-view"
import { userRuntime } from "@/user"

function UserLayout() {
  return (
    <ReactRuntime.Provider runtime={userRuntime} fallback={<p>Loading user...</p>}>
      <Link to="/user">Profile</Link>
      <Link to="/user/edit">Edit</Link>

      <Outlet />
    </ReactRuntime.Provider>
  )
}

export const Route = createFileRoute("/user")({
  component: UserLayout,
})
```

Like the root provider, it accepts React Suspense props. An asynchronous layer
suspends it, so give it a `fallback`.

## Read it from the routes

A component reads the extended context with `Component.withContext`, passing
the `context` of the extended runtime. It can use the services of the layer and
those of the parent runtime:

```tsx title="src/routes/user.edit.tsx"
import { TextField } from "@radix-ui/themes"
import { createFileRoute } from "@tanstack/react-router"
import { Component, Lens } from "effect-view"
import { CurrentUser, userRuntime } from "@/user"

const EditUserView = Component.make("EditUserView")(function* () {
  const user = yield* CurrentUser
  const [name, setName] = yield* Lens.useState(user.name)

  return (
    <TextField.Root
      value={name}
      onChange={event => setName(event.currentTarget.value)}
    />
  )
}).pipe(
  Component.withContext(userRuntime.context),
)

export const Route = createFileRoute("/user/edit")({
  component: EditUserView,
})
```

## Lifetime

- The layer is built each time the provider mounts and released after it
  unmounts. Going to `/user`, leaving it, and coming back builds the services
  again, so their state starts from scratch.
- The services of the parent are shared with it, not built again.
- Navigating between the routes below the provider keeps the services alive.
  In the example, the name typed in `/user/edit` is still there in `/user`.
- If the layer fails to build, the error goes to the nearest React error
  boundary above the provider.

## Nest extended runtimes

An extended runtime can be extended itself. Its provider goes below the one of
its parent:

```ts
const draftRuntime = userRuntime.extend(DraftService.layer)
```

## Limits

- The provider of the parent must be rendered above the provider of the
  extended runtime. Otherwise it throws an error saying so.
- The layer is fixed when the extended runtime is declared. It cannot be built
  from route parameters.
- The services only exist in React. Code that runs outside the component tree,
  such as router loaders, does not see them.
