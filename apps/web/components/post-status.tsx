import type { PostState } from "@/app/community/actions";

export function PostStatus({ state }: { state: PostState }) {
  if (!state) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-verified" : "text-conflicting"}`}>
      {state.message}
    </p>
  );
}
