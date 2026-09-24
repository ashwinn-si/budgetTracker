import React from "react";
import { Plane } from "lucide-react";

export function FromTripPill({
  name,
  emoji,
  colorKey,
}: {
  name: string;
  emoji?: string;
  colorKey?: string;
}) {
  const color = colorKey || "#22C55E";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full font-medium border max-w-[160px] px-2 py-0.5 text-[10px]"
      style={{ backgroundColor: `${color}1F`, borderColor: `${color}40`, color }}
      title={`From ${name}`}
    >
      {emoji ? <span className="shrink-0">{emoji}</span> : <Plane className="w-3 h-3 shrink-0" />}
      <span className="truncate">From {name}</span>
    </span>
  );
}
