"use client";

import { useEffect, useRef } from "react";

/** Large tagline whose words brighten one at a time as each crosses the middle of the screen. */
export function TaglineReveal({ lines }: { lines: string[] }) {
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const words = ref.current?.querySelectorAll<HTMLSpanElement>("[data-word]");
    if (!words?.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).style.opacity = "1";
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -45% 0px" },
    );
    words.forEach((w) => observer.observe(w));
    return () => observer.disconnect();
  }, []);

  return (
    <p ref={ref} className="mx-auto max-w-[680px] text-balance text-center text-4xl font-semibold sm:text-5xl">
      {lines.map((line, i) => (
        <span key={i} className="block">
          {line.split(" ").map((word, j) => (
            <span
              key={j}
              data-word
              style={{ opacity: 0.3 }}
              className="transition-opacity duration-500 ease-soft motion-reduce:transition-none"
            >
              {word}{" "}
            </span>
          ))}
        </span>
      ))}
    </p>
  );
}
