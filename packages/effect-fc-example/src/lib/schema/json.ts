import type { Schema } from "effect"
import type { JsonValue } from "type-fest"


export const assertEncodedJsonifiable = <S extends Schema.Schema<A, I, R>, A, I extends JsonValue, R>(schema: S & Schema.Schema<A, I, R>): S => schema
export const assertTypeJsonifiable = <S extends Schema.Schema<A, I, R>, A extends JsonValue, I, R>(schema: S & Schema.Schema<A, I, R>): S => schema
