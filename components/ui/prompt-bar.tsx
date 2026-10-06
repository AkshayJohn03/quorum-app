"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Lightbulb,
  MapPin,
  Sparkles,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PromptBarProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  suggestions?: string[];
  onSuggestion?: (s: string) => void;
}

export function PromptBar({
  value,
  onChange,
  onSubmit,
  disabled = false,
  loading = false,
  placeholder = "Describe the concept in your head — any idea, any audience, any city",
  suggestions = [],
  onSuggestion,
}: PromptBarProps) {
  const [focused, setFocused] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // auto-resize
  useEffect(() => {
    const el = taRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.max(56, el.scrollHeight)}px`;
    }
  }, [value]);

  return (
    <div className="w-full">
      {/* glowing border wrapper */}
      <div className="group relative rounded-2xl p-[1.5px] transition-all duration-300"
        style={{
          background: focused
            ? "linear-gradient(135deg, rgba(125,211,252,0.5), rgba(232,180,74,0.3), rgba(125,211,252,0.5))"
            : "var(--hairline)",
        }}
      >
        <div className="rounded-[14px] bg-[#0d1424] p-4">
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!disabled && !loading && value.trim().length >= 12) onSubmit();
              }
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            rows={2}
            maxLength={400}
            aria-label="Describe your concept"
            className="w-full resize-none bg-transparent text-[0.95rem] text-ink placeholder:text-[#5a6478] focus:outline-none leading-relaxed"
            disabled={disabled || loading}
          />

          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6rem] font-mono uppercase tracking-wider"
                style={{ background: "rgba(125,211,252,0.08)", color: "var(--accent)" }}
              >
                <Sparkles size={10} />
                Qloo taste graph
              </span>
              <span className="text-[0.6rem] text-[#5a6478] font-mono">
                {value.length}/400
              </span>
            </div>

            <button
              type="button"
              onClick={onSubmit}
              disabled={disabled || loading || value.trim().length < 12}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-1.5 text-[0.82rem] font-medium transition-all",
                value.trim().length >= 12 && !disabled && !loading
                  ? "bg-white text-[#0a0f1a] hover:bg-[#e8ecf4]"
                  : "bg-[#1a2234] text-[#5a6478] cursor-not-allowed",
              )}
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ArrowRight size={14} />
              )}
              Convene the panel
            </button>
          </div>
        </div>
      </div>

      {/* starter ideas */}
      {suggestions.length > 0 && !value && !loading && (
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="text-[0.68rem] text-[#5a6478] self-center font-mono">try:</span>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                onChange(s);
                onSuggestion?.(s);
              }}
              className="rounded-full border border-[#2a3040] px-3 py-1 text-[0.7rem] text-[#8b96ab] transition-colors hover:border-[#7dd3fc] hover:text-[#7dd3fc]"
            >
              {s.slice(0, 45)}{s.length > 45 ? "…" : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function IdeaIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6" /><path d="M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V18h6v-1.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z" />
    </svg>
  );
}

export { IdeaIcon };
