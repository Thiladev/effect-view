import Link from "@docusaurus/Link"
import Layout from "@theme/Layout"
import clsx from "clsx"
import { Highlight } from "prism-react-renderer"
import type { ReactNode } from "react"

import githubDark from "../prism/github-dark"

import styles from "./index.module.css"

// The terminals stay dark in both color modes, so they use the dark palette
// rather than the one of the current color mode.
function Code({ children }: { readonly children: string }): ReactNode {
  return (
    <Highlight theme={githubDark} code={children} language="tsx">
      {({ tokens, getLineProps, getTokenProps }) => (
        <pre className={styles.code}>
          <code>
            {tokens.map((line, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the code is a constant, so its lines never reorder
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: the tokens of a line never reorder
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </code>
        </pre>
      )}
    </Highlight>
  )
}

const componentExample = `import { Effect } from "effect"
import { Async, Component } from "effect-view"
import { Users } from "./services"

export const UserCard = Component.make("UserCard")(
  function* ({ userId }: { userId: string }) {
    const users = yield* Users

    const user = yield* Component.useOnChange(
      () => users.find(userId),
      [userId],
    )

    yield* Component.useReactEffect(
      () => Effect.forkScoped(users.watch(userId)),
      [userId],
    )

    return (
      <article>
        <h2>{user.name}</h2>
        <p>{user.email}</p>
      </article>
    )
  },
).pipe(Async.async)`

const features = [
  {
    wide: true,
    title: "React renders. Effect does the rest.",
    description:
      "Effect View is not a framework: no router, no bundler, no renderer of its own. Components stay React components, and hooks and libraries keep working next to them. What it gives you is a place for everything that is not rendering. State, operations and IO live in Effect code and services you can name and test on their own, and the component reads them.",
    file: "Counter.tsx",
    code: `// Logic: plain Effect, no React involved
const make = Effect.gen(function* () {
  const count = Lens.fromSubscriptionRef(
    yield* SubscriptionRef.make(0),
  )
  return { count, increment: Lens.update(count, (n) => n + 1) }
})

class CounterService extends Context.Service<
  CounterService,
  Effect.Success<typeof make>
>()("CounterService") {
  static readonly layer = Layer.effect(CounterService, make)
}

// Rendering: all the component does
const Counter = Component.make("Counter")(function* () {
  const counter = yield* CounterService
  const [count] = yield* View.useAll([counter.count])
  const runSync = yield* Component.useRunSync()

  return <button onClick={() => runSync(counter.increment)}>{count}</button>
}).pipe(Component.provide(CounterService.layer))`,
    link: "A component with its logic as a service",
    to: "/docs/common-patterns#a-component-with-its-logic-as-a-service",
  },
  {
    title: "Services and layers, down the tree",
    description:
      "Build one Layer for the application and provide it once. Any component yields the services it needs, and its type says which. Narrow a layer to a single component, or to a subtree, and extend the runtime per route. There is no context plumbing to write.",
    file: "providers.tsx",
    code: `// the whole application
<ReactRuntime.Provider runtime={runtime}>
  <App />
</ReactRuntime.Provider>

// one component, built per instance
const GreetingViewLive = GreetingView.pipe(
  Component.provide(GreetingService.layer),
)

// a subtree, from inside a component
const context = yield* Component.useLayer(layer)`,
    link: "Provide services to a subtree",
    to: "/docs/getting-started#provide-services-to-a-subtree",
  },
  {
    title: "Every component owns a Scope",
    description:
      "Acquire a resource, subscribe, or fork a fiber, and its release is tied to the component. The Scope closes when the component unmounts or when the dependencies of the effect that created the resource change. No cleanup bookkeeping.",
    file: "Notifications.tsx",
    code: `yield* Component.useOnMount(() =>
  Effect.gen(function* () {
    yield* Effect.addFinalizer(() =>
      Console.log("Notifications unmounted"),
    )
    yield* Effect.forkScoped(pollNotifications)
  }),
)`,
    link: "The component root scope",
    to: "/docs/getting-started#the-component-root-scope",
  },
  {
    title: "Reactive state, in or out of React",
    description:
      "A Lens is a writable value that you can focus down to a single field, and a View is a read-only subscription. They live in services, outside any component, and several components can share them. A component re-renders only for what it reads.",
    file: "ProfileEmail.tsx",
    code: `const profile = Lens.focusObjectOn(app.state, "profile")
const email = Lens.focusObjectOn(profile, "email")

// re-renders only when the email changes
const [value, setEmail] = yield* Lens.useState(email)

// read-only, from any number of views
const [name] = yield* View.useAll([app.userName])`,
    link: "State management",
    to: "/docs/state-management",
  },
  {
    title: "Server state, with typed errors",
    description:
      "Queries have reactive keys, caching, stale times, background refresh and invalidation. Mutations follow the same model. The query function is an Effect, so it uses your services, keeps its typed errors, and is interrupted when a newer key supersedes it.",
    file: "PostView.tsx",
    code: `const query = yield* Query.make({
  key, // change the key, the query refetches
  staleTime: "1 minute",
  f: ([, id]) => fetchPost(id), // any Effect
}).pipe(Query.thenRun)

const [state] = yield* View.useAll([query.state])
// state.result is an AsyncResult`,
    link: "Query",
    to: "/docs/query",
  },
  {
    wide: true,
    title: "Forms driven by Schema",
    description:
      "Inputs work with the encoded value, usually a string, while your code receives the validated, decoded one. A single form focuses into field-sized subforms that bind to reusable inputs. An input is either live, validating as the user types, or buffered, validating when it is flushed, and submitting flushes them all.",
    file: "RegisterForm.tsx",
    code: `const form = yield* MutationForm.make({
  schema: RegisterSchema,
  initialEncodedValue: { email: "", password: "" },
  f: ([value]) => register(value), // decoded and valid
}).pipe(MutationForm.thenRun)

const email = Form.focusObjectOn(form, "email")
const input = yield* Form.useBufferedInput(email)
// { value, setValue, flush, flushed }`,
    link: "Forms",
    to: "/docs/forms",
  },
] as const

export default function Home(): ReactNode {
  return (
    <Layout
      title="Effect View"
      description="Write React function components as typed Effect programs"
    >
      <main className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.gridBackdrop} aria-hidden="true" />
          <div className={styles.heroGlow} aria-hidden="true" />

          <div className={clsx("container", styles.heroGrid)}>
            <div className={styles.heroCopy}>
              <Link className={styles.eyebrow} to="/docs/getting-started">
                <span aria-hidden="true">{"//"}</span>
                Effect View for React 19
                <span aria-hidden="true" className={styles.eyebrowArrow}>
                  →
                </span>
              </Link>

              <h1>
                React components,
                <br />
                powered by Effect.
              </h1>

              <p className={styles.lede}>
                A thin layer on top of React for writing components as Effect
                programs. Move logic into typed services and Effect code, and
                leave React to render.
              </p>

              <div className={styles.installBox}>
                <span className={styles.installPrompt} aria-hidden="true">
                  $
                </span>
                <code>npm install effect-view effect</code>
              </div>

              <div className={styles.actions}>
                <Link
                  className={styles.primaryAction}
                  to="/docs/getting-started"
                >
                  Start building
                  <span aria-hidden="true">→</span>
                </Link>
                <Link
                  className={styles.secondaryAction}
                  to="https://github.com/Thiladev/effect-view"
                >
                  View on GitHub
                </Link>
              </div>

              <Link
                className={styles.hotReload}
                to="/docs/getting-started#set-up-hot-reloading-with-vite"
              >
                <span aria-hidden="true">↻</span>
                Hot reload with Vite Fast Refresh
              </Link>
            </div>

            <div className={styles.codeStage}>
              <div className={styles.codeGlow} aria-hidden="true" />
              <div className={styles.codeWindow}>
                <div className={styles.windowBar}>
                  <div className={styles.windowDots} aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <span>UserCard.tsx</span>
                  <span className={styles.windowStatus}>Effect + JSX</span>
                </div>
                <Code>{componentExample}</Code>
                <div className={styles.codeLegend}>
                  <span>
                    <b>01</b> Yield services
                  </span>
                  <span>
                    <b>02</b> Own the lifecycle
                  </span>
                  <span>
                    <b>03</b> Return JSX
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={clsx("container", styles.featuresSection)}>
          <div className={styles.sectionHeading}>
            <p className={styles.sectionKicker}>{"// Why Effect View"}</p>
            <h2>A thin layer on React, with the pieces UI work needs.</h2>
            <p>
              Effect View is not a framework. It adds what a UI keeps asking
              for, such as services, resource lifetimes, state, server data
              and forms, as Effect code, so that React is left with rendering.
            </p>
          </div>

          <div className={styles.featureGrid}>
            {features.map((feature) => (
              <article
                className={clsx(
                  styles.featureCard,
                  "wide" in feature && styles.featureCardWide,
                )}
                key={feature.title}
              >
                <div className={styles.cardCopy}>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </div>
                <div className={styles.cardCode}>
                  <div className={styles.cardCodeBar}>{feature.file}</div>
                  <Code>{feature.code}</Code>
                </div>
                <Link className={styles.cardLink} to={feature.to}>
                  {feature.link}
                  <span aria-hidden="true">→</span>
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className={clsx("container", styles.ctaWrap)}>
          <div className={styles.cta}>
            <div className={styles.ctaGridBackdrop} aria-hidden="true" />
            <div className={styles.ctaCopy}>
              <p className={styles.sectionKicker}>{"// Ready when React is"}</p>
              <h2>Start with one Effect component.</h2>
              <p>
                Add a runtime, cross the React boundary once, and grow into
                the rest of the toolkit only when you need it.
              </p>
            </div>
            <Link className={styles.ctaAction} to="/docs/getting-started">
              Read the guide <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      </main>
    </Layout>
  )
}
