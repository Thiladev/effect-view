import Link from "@docusaurus/Link"
import CodeBlock from "@theme/CodeBlock"
import Layout from "@theme/Layout"
import clsx from "clsx"
import type { ReactNode } from "react"

import styles from "./index.module.css"

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
    icon: "fx",
    title: "Components are Effect programs",
    description:
      "Yield Effects and services directly from a component body, then return ordinary JSX. Types track every dependency all the way to the runtime boundary.",
    tag: "Component.make",
    to: "/docs/getting-started#write-your-first-component",
  },
  {
    icon: "R",
    title: "One typed runtime",
    description:
      "Build your application Layer once. Components access HTTP clients, repositories, configuration, tracing, and your own services without React context plumbing.",
    tag: "ReactRuntime",
    to: "/docs/getting-started#create-the-runtime",
  },
  {
    icon: "S",
    title: "Scopes follow React",
    description:
      "Every component owns an Effect Scope. Resources, subscriptions, and fibers are finalized when their component or dependency lifecycle ends.",
    tag: "Scope.Scope",
    to: "/docs/getting-started#the-component-root-scope",
  },
  {
    icon: "↔",
    title: "Reactive state without a new universe",
    description:
      "Lens and View connect Effect state to React. Focus large models into small writable values and subscribe only where rendering needs them.",
    tag: "Lens + View",
    to: "/docs/state-management",
  },
  {
    icon: "Q",
    title: "TanStack-shaped server state",
    description:
      "Reactive keys, caching, stale times, background refresh, mutations, and invalidation—with typed Effect services, Causes, and scoped fibers underneath.",
    tag: "Query + Mutation",
    to: "/docs/query",
  },
  {
    icon: "Σ",
    title: "Forms driven by Schema",
    description:
      "Keep input-friendly encoded values while application code receives validated, decoded types. Focus one root into reusable field-sized subforms.",
    tag: "MutationForm + LensForm",
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
                Bring typed services, scoped resources, reactive state,
                server queries, and schema-driven forms into React without
                hiding either framework.
              </p>

              <div className={styles.installBox}>
                <span className={styles.installPrompt} aria-hidden="true">
                  $
                </span>
                <code>npm install effect-view effect@rc</code>
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
                <CodeBlock language="tsx">{componentExample}</CodeBlock>
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
            <h2>One model from render to resources.</h2>
            <p>
              Effect View adds the pieces React deliberately leaves open while
              preserving the React component model you already know.
            </p>
          </div>

          <div className={styles.featureGrid}>
            {features.map((feature, index) => (
              <Link
                className={styles.featureCard}
                to={feature.to}
                key={feature.title}
              >
                <div className={styles.cardTopline}>
                  <span className={styles.featureIcon}>{feature.icon}</span>
                  <span className={styles.cardIndex}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
                <div className={styles.cardFooter}>
                  <code>{feature.tag}</code>
                  <span aria-hidden="true">↗</span>
                </div>
              </Link>
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
