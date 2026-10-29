"use client";

import { useActionState } from "react";
import type { PostState } from "@/app/community/actions";

/**
 * Community forms: React resets a form after its action, so a refused post would lose what was
 * typed. The action returns the typed values on failure, and each attempt remounts the form (key)
 * so every field, selects included, starts from them.
 */
export function usePostForm(submit: (prev: PostState, form: FormData) => Promise<PostState>) {
  const [state, action, pending] = useActionState<(PostState & { attempt: number }) | null, FormData>(
    async (prev, form) => ({ ...(await submit(prev, form))!, attempt: (prev?.attempt ?? 0) + 1 }),
    null,
  );
  return { state, action, pending, key: state?.attempt ?? 0, values: state?.values ?? {} };
}
