import { Schema } from "effect"
import { assertEncodedJsonifiable } from "@/lib/schema"


export class Todo extends Schema.Class<Todo>("Todo")({
    _tag: Schema.tag("Todo"),
    id: Schema.String,
    content: Schema.String,
    completedAt: Schema.OptionFromSelf(Schema.DateTimeUtcFromSelf),
}) {}


export const TodoFromJsonStruct = Schema.Struct({
    ...Todo.fields,
    completedAt: Schema.Option(Schema.DateTimeUtc),
}).pipe(
    assertEncodedJsonifiable
)

export const TodoFromJson = Schema.compose(TodoFromJsonStruct, Todo)
