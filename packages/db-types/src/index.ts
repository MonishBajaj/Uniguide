export * from "./database.types";

import type { Database } from "./database.types";

export type ViewRow<T extends keyof Database["public"]["Views"]> = Database["public"]["Views"][T]["Row"];
