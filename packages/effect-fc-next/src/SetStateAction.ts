import { Function } from "effect"
import type * as React from "react"


export const value: {
    <S>(self: React.SetStateAction<S>, prevState: S): S
    <S>(prevState: S): (self: React.SetStateAction<S>) => S
} = Function.dual(2, <S>(self: React.SetStateAction<S>, prevState: S): S =>
    typeof self === "function"
        ? (self as (prevState: S) => S)(prevState)
        : self
)
