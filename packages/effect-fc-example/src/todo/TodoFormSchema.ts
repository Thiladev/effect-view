import { Schema } from "effect"
import * as Domain from "@/domain"
import { DateTimeUtcFromZonedInput } from "@/lib/schema"


export const TodoFormSchema = Schema.compose(Schema.Struct({
    ...Domain.Todo.Todo.fields,
    completedAt: Schema.OptionFromSelf(DateTimeUtcFromZonedInput),
}), Domain.Todo.Todo)
