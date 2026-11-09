import { type Cause, Chunk, Context, DateTime, Duration, Effect, Equal, Exit, Fiber, HashMap, HashSet, Latch, Layer, Option, Order, Predicate, Ref, Scope, Semaphore } from "effect"


export const ScopeRegistryServiceTypeId: unique symbol = Symbol.for("@effect-view/ScopeRegistryService/ScopeRegistryService")
export type ScopeRegistryServiceTypeId = typeof ScopeRegistryServiceTypeId

export interface ScopeRegistryService {
    readonly [ScopeRegistryServiceTypeId]: ScopeRegistryServiceTypeId
    readonly ref: Ref.Ref<HashMap.HashMap<ScopeRegistryService.Key, ScopeRegistryService.Entry>>

    register(
        key: ScopeRegistryService.Key,
        options: ScopeRegistryService.RegisterOptions,
    ): Effect.Effect<ScopeRegistryService.Entry>
    commit(key: ScopeRegistryService.Key): Effect.Effect<ScopeRegistryService.Entry, Cause.NoSuchElementError>
    release(key: ScopeRegistryService.Key): Effect.Effect<ScopeRegistryService.Entry, Cause.NoSuchElementError>

    readonly run: Effect.Effect<void, never, Scope.Scope>
}

export declare namespace ScopeRegistryService {
    export type Key = object

    export interface RegisterOptions {
        readonly finalizerExecutionStrategy: "sequential" | "parallel"
        readonly finalizerExecutionDebounce: Duration.Input
        readonly scopeCommitTimeout: Duration.Input
    }

    export interface Entry {
        readonly scope: Scope.Closeable
        readonly expiresAt: Option.Option<DateTime.Utc>
        readonly finalizerExecutionDebounce: Duration.Input
    }
}

export const isScopeRegistryService = (u: unknown): u is ScopeRegistryService => Predicate.hasProperty(u, ScopeRegistryServiceTypeId)
export const makeKey = (): ScopeRegistryService.Key => Equal.byReference({})


export class ScopeRegistryServiceImpl implements ScopeRegistryService {
    readonly [ScopeRegistryServiceTypeId]: ScopeRegistryServiceTypeId = ScopeRegistryServiceTypeId

    /**
     * @param wake Opened to wake the sweeper when an entry gets a deadline earlier than the one it is currently
     * sleeping until.
     * @param armedAt The deadline the sweeper is currently armed for, in epoch milliseconds of the registry's
     * clock. `Infinity` when there is nothing to expire.
     * @param clock State of the registry's own clock, see `now`.
     * @param closing The batches of scopes being closed right now. `dispose` waits for them.
     * @param finalizerTimeout How long to wait for the finalizers of a single scope before moving on to the next
     * one, and how long `dispose` waits for the scopes being closed. A finalizer that exceeds it is abandoned: it
     * keeps running in the background but nothing waits for it.
     */
    constructor(
        readonly ref: Ref.Ref<HashMap.HashMap<ScopeRegistryService.Key, ScopeRegistryService.Entry>>,
        readonly runSemaphore: Semaphore.Semaphore,
        readonly wake: Latch.Latch,
        readonly armedAt: Ref.Ref<number>,
        readonly clock: Ref.Ref<ClockState>,
        readonly closing: Ref.Ref<HashSet.HashSet<Fiber.Fiber<unknown, unknown>>>,
        readonly finalizerTimeout: Duration.Input = "5 seconds",
    ) {}

    /**
     * The registry's own clock. It follows the wall clock but ignores it going backwards (NTP corrections, the
     * user changing the system time). Deadlines computed from the raw wall clock would otherwise not be reached
     * until it caught up.
     */
    get now(): Effect.Effect<DateTime.Utc> {
        return Effect.flatMap(
            DateTime.now,
            wall => Ref.modify(this.clock, last => {
                const time = DateTime.addDuration(
                    last.time,
                    Duration.max(Duration.zero, DateTime.distance(last.wall, wall)),
                )
                return [time, { time, wall }] as const
            })
        )
    }

    register(
        key: ScopeRegistryService.Key,
        options: ScopeRegistryService.RegisterOptions,
    ): Effect.Effect<ScopeRegistryService.Entry> {
        return Effect.flatMap(
            Scope.make(options.finalizerExecutionStrategy),
            scope => this.now.pipe(
                Effect.map(now => Equal.byReference<ScopeRegistryService.Entry>({
                    scope,
                    expiresAt: Option.some(DateTime.addDuration(now, options.scopeCommitTimeout)),
                    finalizerExecutionDebounce: options.finalizerExecutionDebounce,
                })),
                Effect.tap(entry => Ref.update(this.ref, HashMap.set(key, entry))),
                Effect.tap(entry => this.schedule(entry)),
            ),
        )
    }

    /**
     * Replaces the entry registered under `key` with `f(entry)`, in a single atomic update of the registry.
     */
    update(
        key: ScopeRegistryService.Key,
        f: (entry: ScopeRegistryService.Entry) => ScopeRegistryService.Entry,
    ): Effect.Effect<ScopeRegistryService.Entry, Cause.NoSuchElementError> {
        return Ref.modify(this.ref, entries => Option.match(HashMap.get(entries, key), {
            onNone: () => [Option.none<ScopeRegistryService.Entry>(), entries] as const,
            onSome: entry => {
                const updated = Equal.byReference(f(entry))
                return [Option.some(updated), HashMap.set(entries, key, updated)] as const
            },
        })).pipe(
            Effect.flatMap(Effect.fromOption),
        )
    }

    commit(key: ScopeRegistryService.Key): Effect.Effect<ScopeRegistryService.Entry, Cause.NoSuchElementError> {
        return this.update(key, entry => ({ ...entry, expiresAt: Option.none() }))
    }

    release(key: ScopeRegistryService.Key): Effect.Effect<ScopeRegistryService.Entry, Cause.NoSuchElementError> {
        return Effect.flatMap(
            this.now,
            now => this.update(key, entry => ({
                ...entry,
                expiresAt: Option.some(DateTime.addDuration(now, entry.finalizerExecutionDebounce)),
            })),
        ).pipe(
            Effect.tap(entry => this.schedule(entry)),
        )
    }

    /**
     * Notifies the sweeper of the deadline of an entry.
     *
     * Deadlines are almost always later than the one the sweeper is armed for (they are all `now + constant`), so
     * this does nothing in the common case, and the registry is not rescanned on every lifecycle event.
     */
    schedule(entry: ScopeRegistryService.Entry): Effect.Effect<void> {
        return Option.match(entry.expiresAt, {
            onNone: () => Effect.void,
            onSome: expiresAt => {
                const deadline = DateTime.toEpochMillis(expiresAt)

                return Effect.flatMap(
                    Ref.modify(this.armedAt, armedAt => deadline < armedAt
                        ? [true, deadline] as const
                        : [false, armedAt] as const),
                    earlier => earlier ? Effect.asVoid(this.wake.open) : Effect.void,
                )
            },
        })
    }

    get run(): Effect.Effect<void, never, Scope.Scope> {
        return Effect.addFinalizer(() => this.dispose).pipe(
            Effect.andThen(this.sweep),
            this.runSemaphore.withPermit,
        )
    }

    /**
     * Sleeps until `armedAt`, the earliest deadline anyone has scheduled, unless the latch wakes it earlier because
     * `schedule` lowered `armedAt`. Reaching the deadline closes the expired entries and scans for the next one.
     * A wake-up caused by the latch only goes around again: the registry is scanned once per deadline reached, not
     * on every lifecycle event.
     *
     * The latch is closed before `armedAt` is read, so a deadline scheduled in between either is the value read, or
     * leaves the latch open for the race below.
     */
    get sweep(): Effect.Effect<never> {
        return this.wake.close.pipe(
            Effect.andThen(Ref.get(this.armedAt)),
            Effect.flatMap(deadline => Effect.raceFirst(
                Effect.as(this.sleepUntil(deadline), true),
                Effect.as(this.wake.await, false),
            )),
            Effect.flatMap(expired => expired
                ? Effect.andThen(this.closeExpired, this.arm)
                : Effect.void
            ),
            Effect.forever,
        )
    }

    /**
     * Targets the earliest pending deadline, by scanning the registry. Only needed once a deadline was reached.
     *
     * The order matters. `armedAt` is set to `Infinity` before the scan, so that an entry registered while the
     * scan is running always opens the latch (at worst a harmless extra wake-up). Afterwards `armedAt` is the
     * earliest of the scanned deadline and any deadline scheduled meanwhile, so a later entry only needs to wake
     * the sweeper if its deadline is earlier than that.
     */
    get arm(): Effect.Effect<void> {
        return Ref.set(this.armedAt, Number.POSITIVE_INFINITY).pipe(
            Effect.andThen(Ref.get(this.ref)),
            Effect.map(entries => Option.match(this.getNextExpiration(entries), {
                onNone: () => Number.POSITIVE_INFINITY,
                onSome: DateTime.toEpochMillis,
            })),
            Effect.flatMap(deadline => Ref.update(this.armedAt, armedAt => Math.min(armedAt, deadline))),
        )
    }

    sleepUntil(deadline: number): Effect.Effect<void> {
        return deadline === Number.POSITIVE_INFINITY
            ? Effect.never
            : Effect.flatMap(this.now, now => {
                const remaining = deadline - DateTime.toEpochMillis(now)
                return remaining > 0 ? Effect.sleep(remaining) : Effect.void
            })
    }

    get closeExpired(): Effect.Effect<void> {
        return this.closeBatch(Effect.flatMap(this.now, now => Ref.modify(
            this.ref,
            HashMap.reduce(
                [
                    Chunk.empty<ScopeRegistryService.Entry>(),
                    HashMap.empty<ScopeRegistryService.Key, ScopeRegistryService.Entry>(),
                ] as const,

                ([expired, remaining], entry, key) => Option.exists(
                    entry.expiresAt,
                    expiresAt => DateTime.isLessThanOrEqualTo(expiresAt, now),
                )
                    ? [Chunk.append(expired, entry), remaining] as const
                    : [expired, HashMap.set(remaining, key, entry)] as const,
            ),
        )))
    }

    /**
     * Closes the scopes of the entries returned by `take` in a fiber of their own, so that the sweeper never
     * waits for (or dies from) a finalizer.
     *
     * `take` removes the entries from the registry, and runs inside that fiber, which starts immediately. So
     * either the fiber never started (nothing was removed and the entries are still registered), or it owns the
     * scopes until they are closed. No interruption of the caller can leave scopes that nobody closes.
     *
     * The fiber is detached from any scope: it is tracked in `closing` so that `dispose` can wait for it, but
     * never for longer than `finalizerTimeout`.
     */
    closeBatch(take: Effect.Effect<Iterable<ScopeRegistryService.Entry>>): Effect.Effect<void> {
        const batch = Effect.withFiber(fiber => Ref.update(this.closing, HashSet.add(fiber))).pipe(
            Effect.andThen(take),
            Effect.flatMap(entries => Effect.forEach(
                entries,
                entry => this.closeWithinTimeout(entry.scope),
                { discard: true },
            )),
            Effect.ensuring(Effect.withFiber(fiber => Ref.update(this.closing, HashSet.remove(fiber)))),
        )

        return Effect.asVoid(Effect.forkDetach(batch, { startImmediately: true }))
    }

    /**
     * Closes a scope, whatever its finalizers do. A failing finalizer must not prevent other scopes from being
     * closed, so failures are logged and swallowed.
     */
    closeSafely(scope: Scope.Closeable): Effect.Effect<void> {
        return Effect.uninterruptible(Scope.close(scope, Exit.void)).pipe(
            Effect.catchCause(cause => Effect.logError("A finalizer of a component scope failed", cause)),
        )
    }

    /**
     * Closes a scope and waits for it, but no longer than `finalizerTimeout`. `closeSafely` is uninterruptible,
     * so it runs in a fiber of its own that is abandoned on timeout instead of being interrupted. This way a
     * finalizer that never completes cannot hold back the rest of its batch.
     */
    closeWithinTimeout(scope: Scope.Closeable): Effect.Effect<void> {
        return Effect.flatMap(
            Effect.forkDetach(this.closeSafely(scope), { startImmediately: true }),
            fiber => Effect.raceFirst(
                Fiber.await(fiber),
                Effect.sleep(this.finalizerTimeout).pipe(
                    Effect.andThen(Effect.logWarning(
                        `A component scope was still being closed after ${Duration.toMillis(this.finalizerTimeout)}ms, moving on without it`
                    )),
                ),
            ),
        )
    }

    /**
     * Closes every registered scope and waits for the scopes being closed.
     */
    get dispose(): Effect.Effect<void> {
        return this.closeBatch(Effect.map(
            Ref.getAndSet(
                this.ref,
                HashMap.empty<ScopeRegistryService.Key, ScopeRegistryService.Entry>(),
            ),
            HashMap.values,
        )).pipe(
            Effect.andThen(Ref.set(this.armedAt, Number.POSITIVE_INFINITY)),
            Effect.andThen(this.awaitClosing),
        )
    }

    /**
     * Waits for the scopes being closed, but no longer than `finalizerTimeout`, so that a finalizer that never
     * completes cannot hang the disposal of the runtime.
     */
    get awaitClosing(): Effect.Effect<void> {
        const abandon = Effect.sleep(this.finalizerTimeout).pipe(
            Effect.andThen(Effect.flatMap(Ref.get(this.closing), closing => Effect.logWarning(
                `${HashSet.size(closing)} component scope batch(es) were still being closed after ${Duration.toMillis(this.finalizerTimeout)}ms and were abandoned`
            ))),
        )

        return Effect.raceFirst(
            Effect.flatMap(Ref.get(this.closing), closing => Fiber.awaitAll(closing)),
            abandon,
        )
    }

    getNextExpiration(
        entries: HashMap.HashMap<ScopeRegistryService.Key, ScopeRegistryService.Entry>,
    ): Option.Option<DateTime.Utc> {
        return HashMap.reduce(
            entries,
            Option.none<DateTime.Utc>(),
            (earliest, entry) => Option.match(entry.expiresAt, {
                onNone: () => earliest,
                onSome: expiresAt => Option.some(Option.match(earliest, {
                    onNone: () => expiresAt,
                    onSome: Order.min<DateTime.Utc>(DateTime.Order)(expiresAt),
                })),
            }),
        )
    }
}

interface ClockState {
    readonly time: DateTime.Utc
    readonly wall: DateTime.Utc
}

export declare namespace make {
    export interface Options {
        /**
         * How long to wait for the finalizers of a single scope before moving on to the next one, and how long
         * `dispose` waits for the scopes being closed.
         *
         * @default "5 seconds"
         */
        readonly finalizerTimeout?: Duration.Input
    }
}

export const make = Effect.fnUntraced(function*(
    options: make.Options = {}
): Effect.fn.Return<ScopeRegistryService> {
    return new ScopeRegistryServiceImpl(
        yield* Ref.make(HashMap.empty<ScopeRegistryService.Key, ScopeRegistryService.Entry>()),
        yield* Semaphore.make(1),
        yield* Latch.make(false),
        yield* Ref.make(Number.POSITIVE_INFINITY),
        yield* Effect.flatMap(DateTime.now, now => Ref.make<ClockState>({ time: now, wall: now })),
        yield* Ref.make(HashSet.empty<Fiber.Fiber<unknown, unknown>>()),
        options.finalizerTimeout,
    )
})

export const thenRun = <E = never, R = never>(
    self: Effect.Effect<ScopeRegistryService, E, R>,
): Effect.Effect<ScopeRegistryService, E, Scope.Scope | R> => Effect.tap(
    self,
    client => Effect.forkScoped(client.run),
)


/**
 * Internal Effect service that maintains a registry of scopes associated with React component instances.
 *
 * This service is used internally by the `Component.useScope` hook to manage the lifecycle of component scopes,
 * including tracking active scopes and coordinating their cleanup when components unmount or dependencies change.
 */
export class ScopeRegistry extends Context.Service<ScopeRegistry, ScopeRegistryService>()(
    "@effect-view/ScopeRegistry/ScopeRegistry"
) {}

export const layer: Layer.Layer<ScopeRegistry> = Layer.effect(ScopeRegistry, thenRun(make()))
export const layerWithOptions = (options: make.Options): Layer.Layer<ScopeRegistry> => Layer.effect(ScopeRegistry, thenRun(make(options)))
