import { DateTime, Effect, Option, ParseResult, Schema } from "effect"


export class DateTimeUtcFromZoned extends Schema.transformOrFail(
    Schema.DateTimeZonedFromSelf,
    Schema.DateTimeUtcFromSelf,
    {
        strict: true,
        encode: DateTime.setZoneCurrent,
        decode: i => ParseResult.succeed(DateTime.toUtc(i)),
    },
) {}

export class DateTimeZonedFromUtc extends Schema.transformOrFail(
    Schema.DateTimeUtcFromSelf,
    Schema.DateTimeZonedFromSelf,
    {
        strict: true,
        encode: a => ParseResult.succeed(DateTime.toUtc(a)),
        decode: DateTime.setZoneCurrent,
    },
) {}

export class DateTimeUtcFromZonedInput extends Schema.transformOrFail(
    Schema.String,
    DateTimeUtcFromZoned,
    {
        strict: true,
        encode: a => ParseResult.succeed(DateTime.formatIsoZoned(a).slice(0, 16)),
        decode: (i, _, ast) => Effect.flatMap(
            DateTime.CurrentTimeZone,
            timeZone => Option.match(DateTime.makeZoned(i, { timeZone, adjustForTimeZone: true }), {
                onSome: ParseResult.succeed,
                onNone: () => ParseResult.fail(new ParseResult.Type(ast, i, `Unable to decode ${JSON.stringify(i)} into a DateTime.Zoned`)),
            }),
        ),
    },
) {}
