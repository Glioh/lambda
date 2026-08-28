import type { Static, TSchema } from "typebox";
import { Type } from "typebox";

/**
 * Creates a schema reference for a given TypeBox schema for use in other schemas.
 * The schema must have a $id property.
 * @param schema The TypeBox schema to reference.
 * @returns A TypeBox reference to the schema.
 */
export function schemaRef<T extends TSchema>(schema: T) {
	const id = (schema as T & { $id?: string }).$id;
	if (typeof id !== "string") throw new Error("schemaRef requires schema with $id");
	return Type.Unsafe<Static<T>>(Type.Ref(id));
}
