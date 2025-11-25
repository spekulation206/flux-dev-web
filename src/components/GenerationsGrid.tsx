import React from "react";
import { Loader2, AlertCircle, Check, Download, Wand2 } from "lucide-react";
import { Generation } from "@/context/SessionContext";

interface GenerationsGridProps {
  generations: Generation[];
  onUpdateImage: (file: File, metadata?: { prompt?: string; model?: string }) => void;
  onRetry?: (generation: Generation) => void;
}

export function GenerationsGrid({ generations, onUpdateImage, onRetry }: GenerationsGridProps) {
  if (generations.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-foreground/30 gap-2 min-h-[200px]">
        <Wand2 size={48} />
        <p>No generations yet. Enter a prompt to start.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
      {generations.map((gen) => (
        <div 
          key={gen.id} 
          className="relative aspect-[4/3] bg-black/5 rounded-lg border border-border overflow-hidden group"
        >
          {gen.status === "completed" && gen.imageUrl ? (
            <>
              <img 
                src={gen.imageUrl} 
                alt={gen.prompt} 
                className="w-full h-full object-contain bg-black/10"
              />
              
              {/* Actions Bar - Always visible at bottom */}
              <div className="absolute bottom-0 left-0 right-0 p-2 bg-black/70 text-white flex items-center justify-between gap-2 backdrop-blur-sm">
                <p className="text-xs truncate flex-1 opacity-90" title={gen.prompt}>
                  {gen.prompt}
                </p>
                
                <div className="flex items-center gap-1 shrink-0">
                  {gen.file && (
                    <button 
                      onClick={() => onUpdateImage(gen.file!, { prompt: gen.prompt, model: gen.model })}
                      className="p-1.5 hover:bg-white/20 rounded-full transition-colors"
                      title="Use this image"
                    >
                      <Check size={16} />
                    </button>
                  )}
                  <a 
                    href={gen.imageUrl} 
                    download={`generated-${gen.id}.png`}
                    className="p-1.5 hover:bg-white/20 rounded-full transition-colors"
                    title="Download"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Download size={16} />
                  </a>
                </div>
              </div>
            </>
          ) : gen.status === "failed" ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-red-500 p-4 text-center gap-2">
              <AlertCircle size={24} />
              <p className="text-xs line-clamp-3">{gen.error || "Failed"}</p>
              {onRetry && (
                <button 
                  onClick={() => onRetry(gen)}
                  className="text-xs underline hover:text-red-600 mt-2"
                >
                  Retry
                </button>
              )}
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-foreground/50 gap-2">
              <Loader2 size={24} className="animate-spin" />
              <p className="text-xs font-medium animate-pulse">Generating...</p>
              <p className="text-[10px] opacity-70 max-w-[80%] text-center truncate">{gen.prompt}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

