import { Array, Equivalence } from "effect"


/** The path of a subform in its root form: the keys and indices that were focused. */
export type FormPath = readonly PropertyKey[]

export const equivalence: Equivalence.Equivalence<FormPath> = Array.makeEquivalence(Equivalence.strictEqual<PropertyKey>())

/** Whether `path` is `prefix` or a descendant of it. */
export const isPrefixOf = (prefix: FormPath, path: FormPath): boolean => equivalence(prefix, Array.take(path, prefix.length))
