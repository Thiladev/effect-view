<p align="center">
  <a href="https://thila.dev/effect-view">
    <img src="packages/docs/static/img/logo.svg" width="104" height="104" alt="Effect View logo" />
  </a>
</p>

<h1 align="center">Effect View Monorepo</h1>

<p align="center">
  Write React components as typed Effect programs.
</p>

This repository contains Effect View, its documentation, development examples,
and supporting tooling. Effect View brings Effect's typed services, resource
safety, concurrency, and data modeling to React while keeping ordinary React
components, hooks, and JSX.

## Packages

| Package | Description |
| --- | --- |
| [`effect-view`](packages/effect-fc-next) | The Effect View library for Effect v4 and React 19. |
| [`@effect-view/vite-plugin`](packages/vite-plugin) | Vite Fast Refresh support for Effect View components. |
| [`docs`](packages/docs) | The [Effect View documentation](https://thila.dev/effect-view), built with Docusaurus. |
| [`example-next`](packages/example-next) | Example application using Effect View and Effect v4. |
| [`effect-fc`](packages/effect-fc) | Legacy Effect v3 package. |
| [`example`](packages/example) | Example application for the legacy package. |

## Development

The monorepo uses [Bun](https://bun.sh/) workspaces and
[Turborepo](https://turbo.build/).

```bash
bun install
```

Run checks and builds from the repository root:

```bash
bun run lint:tsc
bun run lint:biome
bun run test
bun run build
```

Start the Effect View example or documentation site:

```bash
bun run --cwd packages/example-next dev
bun run --cwd packages/docs start
```

## Documentation

Read the documentation at
[thila.dev/effect-view](https://thila.dev/effect-view).

## License

[MIT](LICENSE)
