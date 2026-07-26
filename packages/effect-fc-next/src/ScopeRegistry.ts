import { type Cause, Chunk, Context, DateTime, type Duration, Effect, Equal, Exit, HashMap, Layer, Option, Order, Predicate, Scope, Semaphore, Stream, SubscriptionRef } from "effect"


export const ScopeRegistryServiceTypeId: unique symbol = Symbol.for("@effect-view/ScopeRegistryService/ScopeRegistryService")
export type ScopeRegistryServiceTypeId = typeof ScopeRegistryServiceTypeId

export interface ScopeRegistryService {
    readonly [ScopeRegistryServiceTypeId]: ScopeRegistryServiceTypeId
    readonly ref: SubscriptionRef.SubscriptionRef<HashMap.HashMap<ScopeRegistryService.Key, ScopeRegistryService.Entry>>

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

    constructor(
        readonly ref: SubscriptionRef.SubscriptionRef<HashMap.HashMap<ScopeRegistryService.Key, ScopeRegistryService.Entry>>,
        readonly runSemaphore: Semaphore.Semaphore,
    ) {}

    register(
        key: ScopeRegistryService.Key,
        options: ScopeRegistryService.RegisterOptions,
    ): Effect.Effect<ScopeRegistryService.Entry> {
        return Effect.gen({ self: this }, function*() {
            const entry = Equal.byReference({
                scope: yield* Scope.make(options.finalizerExecutionStrategy),
                expiresAt: Option.some(DateTime.addDuration(yield* DateTime.now, options.scopeCommitTimeout)),
                finalizerExecutionDebounce: options.finalizerExecutionDebounce,
            })

            yield* SubscriptionRef.update(this.ref, HashMap.set(key, entry))
            return entry
        })
    }

    commit(key: ScopeRegistryService.Key): Effect.Effect<ScopeRegistryService.Entry, Cause.NoSuchElementError> {
        return SubscriptionRef.get(this.ref).pipe(
            Effect.map(HashMap.get(key)),
            Effect.flatMap(Effect.fromOption),
            Effect.map(entry => Equal.byReference<ScopeRegistryService.Entry>({
                ...entry,
                expiresAt: Option.none(),
            })),
            Effect.tap(entry => SubscriptionRef.update(this.ref, HashMap.set(key, entry))),
        )
    }

    release(key: ScopeRegistryService.Key): Effect.Effect<ScopeRegistryService.Entry, Cause.NoSuchElementError> {
        return SubscriptionRef.get(this.ref).pipe(
            Effect.map(HashMap.get(key)),
            Effect.flatMap(option => Effect.all([
                DateTime.now,
                Effect.fromOption(option),
            ])),
            Effect.map(([now, entry]) => Equal.byReference<ScopeRegistryService.Entry>({
                ...entry,
                expiresAt: Option.some(DateTime.addDuration(now, entry.finalizerExecutionDebounce)),
            })),
            Effect.tap(entry => SubscriptionRef.update(this.ref, HashMap.set(key, entry))),
        )
    }

    get run(): Effect.Effect<void, never, Scope.Scope> {
        return Effect.addFinalizer(() => this.dispose).pipe(
            Effect.andThen(SubscriptionRef.changes(this.ref).pipe(
                Stream.switchMap(entries => Option.match(this.getNextExpiration(entries), {
                    onNone: () => Stream.never,
                    onSome: expiresAt => Stream.fromEffect(DateTime.now.pipe(
                        Effect.flatMap(now => DateTime.isLessThan(now, expiresAt)
                            ? Effect.sleep(DateTime.distance(now, expiresAt))
                            : Effect.void),
                        Effect.andThen(Effect.uninterruptible(this.closeExpired)),
                    )),
                })),
                Stream.runDrain,
            )),
            this.runSemaphore.withPermit,
        )
    }

    get dispose(): Effect.Effect<void> {
        return SubscriptionRef.getAndSet(
            this.ref,
            HashMap.empty<ScopeRegistryService.Key, ScopeRegistryService.Entry>(),
        ).pipe(
            Effect.flatMap(entries => Effect.forEach(
                HashMap.values(entries),
                entry => Scope.close(entry.scope, Exit.void),
            )),
            Effect.asVoid,
        )
    }

    get closeExpired(): Effect.Effect<void> {
        return Effect.flatMap(DateTime.now, now => SubscriptionRef.modify(
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
        )).pipe(
            Effect.flatMap(entries => Effect.forEach(
                entries,
                entry => Scope.close(entry.scope, Exit.void),
            )),
            Effect.asVoid,
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

export const make: Effect.Effect<ScopeRegistryService> = Effect.gen(function*() {
    return new ScopeRegistryServiceImpl(
        yield* SubscriptionRef.make(HashMap.empty<ScopeRegistryService.Key, ScopeRegistryService.Entry>()),
        yield* Semaphore.make(1),
    )
})


/**
 * Internal Effect service that maintains a registry of scopes associated with React component instances.
 *
 * This service is used internally by the `Component.useScope` hook to manage the lifecycle of component scopes,
 * including tracking active scopes and coordinating their cleanup when components unmount or dependencies change.
 */
export class ScopeRegistry extends Context.Service<ScopeRegistry, ScopeRegistryService>()(
    "@effect-view/ScopeRegistry/ScopeRegistry"
) {}

export const layer = Layer.effect(ScopeRegistry, Effect.tap(
    make,
    registry => Effect.forkScoped(registry.run),
))
