"use client";

import { useState, useEffect, useRef } from "react";
import { History } from "lucide-react";

interface PromptHistoryProps {
  section: string;
  onSelect: (prompt: string) => void;
}

export function PromptHistory({ section, onSelect }: PromptHistoryProps) {
  const [prompts, setPrompts] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/history?section=${section}`);
      if (res.ok) {
        const data = await res.json();
        setPrompts(data.prompts);
      }
    } catch (e) {
      console.error("Failed to fetch history", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen, section]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-foreground/50 hover:text-foreground transition-colors"
        title="Prompt History"
      >
        <History size={16} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 max-h-[60vh] overflow-y-auto bg-background border border-border rounded-sm z-[9999] text-xs">
          {loading ? (
            <div className="p-4 text-center opacity-50">Loading...</div>
          ) : prompts.length === 0 ? (
            <div className="p-4 text-center opacity-50">No history yet</div>
          ) : (
            <div className="flex flex-col divide-y divide-border/20">
              {prompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => {
                    onSelect(prompt);
                    setIsOpen(false);
                  }}
                  className="text-left p-2 hover:bg-foreground/5 transition-colors truncate"
                  title={prompt}
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

