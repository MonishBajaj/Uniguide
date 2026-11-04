/**
 * Monogram badge for an institution or program.
 * Renders an academic crest-like badge using the institution's initials and a deterministic palette.
 */
export function InstitutionMonogram({
  name,
  size = "md",
  className = "",
}: {
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const words = name.replace(/University|College|Institute of Technology|School of/gi, "").trim().split(/\s+/);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 3)).toUpperCase();

  // Deterministic palette based on name hash
  const colors = [
    { bg: "bg-[#00183d]", text: "text-white" },       // Oxford / Stanford navy
    { bg: "bg-[#8b1e1e]", text: "text-[#ffdad6]" },    // Harvard crimson
    { bg: "bg-[#003628]", text: "text-[#a0f3d4]" },    // Dartmouth forest green
    { bg: "bg-[#1f2937]", text: "text-[#e5e7eb]" },    // MIT charcoal
    { bg: "bg-[#0f2d5c]", text: "text-[#adc6ff]" },    // Yale cobalt
    { bg: "bg-[#650d00]", text: "text-[#ffdad3]" },    // Cornell carnelian
  ];

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const color = colors[Math.abs(hash) % colors.length];

  const sizeClasses = {
    sm: "w-8 h-8 text-xs rounded-md",
    md: "w-11 h-11 text-sm rounded-lg",
    lg: "w-14 h-14 text-base rounded-xl",
    xl: "w-20 h-20 text-xl rounded-2xl",
  }[size];

  return (
    <div
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center font-serif font-bold tracking-wider select-none shadow-sm ${color.bg} ${color.text} ${sizeClasses} ${className}`}
    >
      {initials}
    </div>
  );
}
