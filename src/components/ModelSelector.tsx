"use client";

import React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ModelOption {
  id: string;
  label: string;
  provider?: "replicate" | "gemini";
}

interface ModelSelectorProps {
  models: ModelOption[];
  selectedModelId: string;
  onSelect: (modelId: string) => void;
  className?: string;
}

export function ModelSelector({ models, selectedModelId, onSelect, className }: ModelSelectorProps) {
  return (
    <div className={cn("relative inline-block text-left", className)}>
      <select
        value={selectedModelId}
        onChange={(e) => onSelect(e.target.value)}
        className="appearance-none w-full bg-transparent border border-foreground rounded-sm pl-3 pr-8 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-foreground cursor-pointer"
      >
        {models.map((model) => (
          <option key={model.id} value={model.id} className="bg-background text-foreground">
            {model.label}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-foreground">
        <ChevronDown size={14} />
      </div>
    </div>
  );
}

