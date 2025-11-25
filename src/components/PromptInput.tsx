import React, { useState, useCallback } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { PromptHistory } from "./PromptHistory";

interface PromptInputProps {
  placeholder?: string;
  initialValue?: string;
  onSubmit: (value: string) => void;
  isProcessing?: boolean;
  buttonLabel?: string;
  buttonIcon?: React.ReactNode;
  className?: string;
  section?: string; // Added for history
}

export function PromptInput({
  placeholder = "Describe what to change...",
  initialValue = "",
  onSubmit,
  isProcessing = false,
  buttonLabel = "Generate",
  buttonIcon,
  className = "",
  section,
}: PromptInputProps) {
  const [value, setValue] = useState(initialValue);

  const handleSubmit = useCallback(async () => {
    const trimmedValue = value.trim();
    if (!trimmedValue || isProcessing) return;
    
    onSubmit(trimmedValue);

    // Save to history if section is provided
    if (section) {
      try {
        await fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ section, prompt: trimmedValue }),
        });
      } catch (e) {
        console.error("Failed to save prompt history", e);
      }
    }
  }, [value, isProcessing, onSubmit, section]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {section && (
        <div className="flex justify-end">
          <PromptHistory section={section} onSelect={setValue} />
        </div>
      )}
      <div className="flex gap-2">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="input-primary flex-1 min-h-[120px] resize-y"
          onKeyDown={handleKeyDown}
          disabled={isProcessing}
          rows={5}
        />
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || isProcessing}
          className="btn-primary whitespace-nowrap flex items-center gap-2 px-6 self-start"
        >
          {isProcessing ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            buttonIcon || <Wand2 size={16} />
          )}
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}

