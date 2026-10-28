import type { Json } from "@uniguide/db-types";

/** jsonb columns are non-null JSON; plain objects from our own code are safe to store as such. */
export const asJson = (value: object) => value as { [key: string]: Json | undefined } | Json[];
