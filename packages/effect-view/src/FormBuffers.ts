import { Array, Effect, HashMap, Ref, type Scope } from "effect"
import * as FormPath from "./FormPath.js"


/**
 * The registry of the inputs bound to a form that can hold a value back from it: buffered inputs (see
 * `Form.useBufferedInput`), and live inputs while their debounce is pending. It is owned by the root form and passed
 * unchanged through every `focus*` function of `Form`, so that the root can flush those values before it is submitted.
 */
export interface FormBuffers {
    /**
     * Registers the flush of an input bound to the subform at `path`, until the scope is closed.
     *
     * `flush` writes the value that the input holds back to the form, if there is one.
     */
    register(
        path: readonly PropertyKey[],
        flush: Effect.Effect<void>,
    ): Effect.Effect<void, never, Scope.Scope>

    /**
     * Flushes the registered inputs, one after the other. Resolves once the values are written to the form and
     * validated.
     *
     * Only flushes the inputs bound to `prefix` or to one of its descendants. Defaults to the root, so everything.
     */
    flush(prefix?: FormPath.FormPath): Effect.Effect<void>
}

export const make: Effect.Effect<FormBuffers> = Effect.gen(function*() {
    const entries = yield* Ref.make(
        HashMap.empty<symbol, {
            readonly path: FormPath.FormPath,
            readonly flush: Effect.Effect<void>,
        }>()
    )

    return {
        register: (path, flush) => Effect.asVoid(
            Effect.acquireRelease(
                Effect.tap(
                    Effect.sync(Symbol),
                    key => Ref.update(entries, HashMap.set(key, { path, flush })),
                ),
                key => Ref.update(entries, HashMap.remove(key)),
            )
        ),

        // The entries are read once: a flush can unmount or remount inputs.
        flush: (prefix = []) => Ref.get(entries).pipe(
            Effect.map(HashMap.values),
            Effect.flatMap(values => Effect.forEach(
                Array.filter(values, entry => FormPath.isPrefixOf(prefix, entry.path)),
                entry => entry.flush,
                { discard: true },
            )),
        ),
    } satisfies FormBuffers
})
