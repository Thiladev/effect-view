import { Effect, HashMap, Ref, Scope } from "effect"
import { describe, expect, it, vi } from "vitest"
import * as ScopeRegistry from "./ScopeRegistry.js"


const options = (overrides: Partial<ScopeRegistry.ScopeRegistryService.RegisterOptions> = {}): ScopeRegistry.ScopeRegistryService.RegisterOptions => ({
    finalizerExecutionStrategy: "sequential",
    finalizerExecutionDebounce: "20 millis",
    scopeCommitTimeout: "20 millis",
    ...overrides,
})

const makeRegistry = (options?: ScopeRegistry.make.Options) => Effect.map(
    ScopeRegistry.make(options),
    registry => registry as ScopeRegistry.ScopeRegistryServiceImpl,
)

const size = (registry: ScopeRegistry.ScopeRegistryServiceImpl) => Effect.map(Ref.get(registry.ref), HashMap.size)

/**
 * Runs `f` with a registry whose sweeper is running, and tracks when scopes get closed.
 */
const withRegistry = <A>(
    f: (
        registry: ScopeRegistry.ScopeRegistryServiceImpl,
        register: (
            key: object,
            options: ScopeRegistry.ScopeRegistryService.RegisterOptions,
            finalizer?: Effect.Effect<void>,
        ) => Effect.Effect<{ closed: () => boolean }>,
    ) => Effect.Effect<A, unknown>,
    registryOptions?: ScopeRegistry.make.Options,
) => Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const registry = yield* makeRegistry(registryOptions)
    yield* Effect.forkScoped(registry.run)
    yield* Effect.sleep("5 millis")

    return yield* f(registry, (key, options, finalizer) => Effect.gen(function*() {
        const entry = yield* registry.register(key, options)
        let closed = false
        if (finalizer)
            yield* Scope.addFinalizer(entry.scope, finalizer)
        yield* Scope.addFinalizer(entry.scope, Effect.sync(() => { closed = true }))
        return { closed: () => closed }
    }))
})))

describe("ScopeRegistry", () => {
    it("closes a scope that is never committed after the commit timeout", () => withRegistry(
        (registry, register) => Effect.gen(function*() {
            const key = ScopeRegistry.makeKey()
            const probe = yield* register(key, options())

            yield* Effect.sleep("5 millis")
            expect(probe.closed()).toBe(false)

            yield* Effect.sleep("60 millis")
            expect(probe.closed()).toBe(true)
            expect(yield* size(registry)).toBe(0)
        })
    ))

    it("keeps a committed scope alive and closes it after the debounce once released", () => withRegistry(
        (registry, register) => Effect.gen(function*() {
            const key = ScopeRegistry.makeKey()
            const probe = yield* register(key, options())
            yield* registry.commit(key)

            yield* Effect.sleep("60 millis")
            expect(probe.closed()).toBe(false)
            expect(yield* size(registry)).toBe(1)

            yield* registry.release(key)
            yield* Effect.sleep("60 millis")
            expect(probe.closed()).toBe(true)
            expect(yield* size(registry)).toBe(0)
        })
    ))

    it("cancels a pending release when the scope is committed again", () => withRegistry(
        (registry, register) => Effect.gen(function*() {
            const key = ScopeRegistry.makeKey()
            const probe = yield* register(key, options())
            yield* registry.commit(key)
            yield* registry.release(key)
            yield* registry.commit(key)

            yield* Effect.sleep("60 millis")
            expect(probe.closed()).toBe(false)
            expect(yield* size(registry)).toBe(1)
        })
    ))

    it("wakes the sweeper for a deadline earlier than the one it is sleeping until", () => withRegistry(
        (_registry, register) => Effect.gen(function*() {
            const late = yield* register(ScopeRegistry.makeKey(), options({ scopeCommitTimeout: "10 seconds" }))
            yield* Effect.sleep("10 millis")
            const early = yield* register(ScopeRegistry.makeKey(), options({ scopeCommitTimeout: "20 millis" }))

            yield* Effect.sleep("70 millis")
            expect(early.closed()).toBe(true)
            expect(late.closed()).toBe(false)
        })
    ))

    it("wakes an idle sweeper when the first entry is registered", () => withRegistry(
        (_registry, register) => Effect.gen(function*() {
            yield* Effect.sleep("20 millis")
            const probe = yield* register(ScopeRegistry.makeKey(), options())

            yield* Effect.sleep("70 millis")
            expect(probe.closed()).toBe(true)
        })
    ))

    it("closes every registered scope when the registry is disposed", async () => {
        const closed: boolean[] = []

        await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
            const registry = yield* makeRegistry()
            yield* Effect.forkScoped(registry.run)
            yield* Effect.sleep("5 millis")

            for (let i = 0; i < 3; i++) {
                const entry = yield* registry.register(ScopeRegistry.makeKey(), options({ scopeCommitTimeout: "10 seconds" }))
                const index = closed.push(false) - 1
                yield* Scope.addFinalizer(entry.scope, Effect.sync(() => { closed[index] = true }))
            }
        })))

        expect(closed).toEqual([true, true, true])
    })

    it("keeps closing scopes after a finalizer dies", () => withRegistry(
        (_registry, register) => Effect.gen(function*() {
            yield* register(ScopeRegistry.makeKey(), options(), Effect.die("boom"))
            yield* Effect.sleep("1 second")

            const probe = yield* register(ScopeRegistry.makeKey(), options())
            yield* Effect.sleep("80 millis")
            expect(probe.closed()).toBe(true)
        })
    ))

    it("does not make a scope wait for a slow finalizer of an earlier batch", () => withRegistry(
        (_registry, register) => Effect.gen(function*() {
            yield* register(ScopeRegistry.makeKey(), options(), Effect.sleep("500 millis"))
            yield* Effect.sleep("40 millis")

            const probe = yield* register(ScopeRegistry.makeKey(), options())
            yield* Effect.sleep("100 millis")
            expect(probe.closed()).toBe(true)
        })
    ))

    it("does not let a finalizer that never completes hold back later scopes", () => withRegistry(
        (_registry, register) => Effect.gen(function*() {
            yield* register(ScopeRegistry.makeKey(), options(), Effect.never)
            yield* Effect.sleep("40 millis")

            const probe = yield* register(ScopeRegistry.makeKey(), options())
            yield* Effect.sleep("100 millis")
            expect(probe.closed()).toBe(true)
        }),
        { finalizerTimeout: "50 millis" },
    ))

    it("does not let a finalizer that never completes hold back the rest of its batch", async () => {
        const registry = await Effect.runPromise(makeRegistry({ finalizerTimeout: "30 millis" }))
        const closed: number[] = []

        // One of the scopes hangs. The order they are closed in is not defined, so there are enough of them
        // for the hanging one not to be last.
        for (const index of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
            const entry = await Effect.runPromise(registry.register(ScopeRegistry.makeKey(), options({ scopeCommitTimeout: "1 millis" })))
            const finalizer = index === 0 ? Effect.never : Effect.sync(() => { closed.push(index) })
            await Effect.runPromise(Scope.addFinalizer(entry.scope, finalizer))
        }
        await new Promise(resolve => setTimeout(resolve, 10))

        await Effect.runPromise(Effect.andThen(registry.closeExpired, registry.awaitClosing))

        expect([...closed].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    })

    it("does not hang the disposal because of a finalizer that never completes", async () => {
        const started = Date.now()

        await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
            const registry = yield* makeRegistry({ finalizerTimeout: "50 millis" })
            yield* Effect.forkScoped(registry.run)
            yield* Effect.sleep("5 millis")

            const entry = yield* registry.register(ScopeRegistry.makeKey(), options({ scopeCommitTimeout: "10 seconds" }))
            yield* Scope.addFinalizer(entry.scope, Effect.never)
        })))

        expect(Date.now() - started).toBeLessThan(1000)
    }, 3000)

    it("still expires scopes after the wall clock jumps backwards", () => withRegistry(
        (_registry, register) => Effect.gen(function*() {
            const probe = yield* register(ScopeRegistry.makeKey(), options())

            const realNow = Date.now.bind(Date)
            const spy = vi.spyOn(Date, "now").mockImplementation(() => realNow() - 3_600_000)
            try {
                yield* Effect.sleep("150 millis")
                expect(probe.closed()).toBe(true)
            }
            finally {
                spy.mockRestore()
            }
        })
    ))

    it("does not rescan the registry on every lifecycle event when they are spread out", () => withRegistry(
        (registry, register) => Effect.gen(function*() {
            let scans = 0
            const getNextExpiration = registry.getNextExpiration.bind(registry)
            registry.getNextExpiration = entries => {
                scans++
                return getNextExpiration(entries)
            }

            const keys = Array.from({ length: 300 }, () => ScopeRegistry.makeKey())
            const probes = []
            for (const key of keys) {
                probes.push(yield* register(key, options({ scopeCommitTimeout: "10 seconds" })))
                yield* Effect.yieldNow
            }
            for (const key of keys) {
                yield* registry.commit(key)
                yield* Effect.yieldNow
            }
            for (const key of keys) {
                yield* registry.release(key)
                yield* Effect.yieldNow
            }

            expect(scans).toBeLessThan(30)

            yield* Effect.sleep("100 millis")
            expect(probes.every(probe => probe.closed())).toBe(true)
            expect(yield* size(registry)).toBe(0)
        })
    ))
})
