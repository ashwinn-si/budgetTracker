"use client";

import React from "react";
import { Tag as TagIcon, X } from "lucide-react";

interface TagItem {
  _id: string;
  name: string;
  colorKey?: string;
}

interface TagFilterProps {
  tags: TagItem[];
  selectedTagIds: string[];
  onToggleTag: (tagId: string) => void;
  onSelectAll: () => void;
}

export function TagFilter({
  tags,
  selectedTagIds,
  onToggleTag,
  onSelectAll,
}: TagFilterProps) {
  const isAllSelected = selectedTagIds.length === 0;

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
      <button
        type="button"
        onClick={onSelectAll}
        className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 ${
          isAllSelected
            ? "bg-emerald-600 text-white shadow-sm font-semibold"
            : "bg-black/[0.04] dark:bg-white/[0.05] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
        }`}
      >
        <span>All Tags</span>
        {isAllSelected && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
      </button>

      {tags.map((tag) => {
        const isSelected = selectedTagIds.includes(tag._id);
        return (
          <button
            key={tag._id}
            type="button"
            onClick={() => onToggleTag(tag._id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 border ${
              isSelected
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 font-semibold"
                : "bg-black/[0.03] dark:bg-white/[0.04] text-[var(--text-secondary)] border-transparent hover:border-black/[0.08] dark:hover:border-white/[0.1] hover:text-[var(--text-primary)]"
            }`}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: tag.colorKey || "#10B981" }}
            />
            <span>{tag.name}</span>
            {isSelected && <X className="w-3 h-3 opacity-60 ml-0.5" />}
          </button>
        );
      })}
    </div>
  );
}
