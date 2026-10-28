"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LOCAL_KEY, readLocalShortlist } from "@/components/shortlist-button";
import { mergeLocalShortlist } from "./actions";

/** Moves courses shortlisted before signing in from this device into the account, once. */
export function MergeLocalShortlist() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const ids = readLocalShortlist();
    if (ids.length === 0) return;
    mergeLocalShortlist(ids).then((result) => {
      if (result.ok) {
        localStorage.removeItem(LOCAL_KEY);
        router.refresh();
      } else if (result.message) {
        setMessage(result.message);
      }
    });
  }, [router]);
  return message ? <p role="status" className="text-sm text-muted">{message}</p> : null;
}
