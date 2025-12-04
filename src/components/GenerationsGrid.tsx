import React from "react";
import { Loader2, AlertCircle, Check, Download, Wand2, RefreshCw } from "lucide-react";
import { Generation } from "@/context/SessionContext";

interface GenerationsGridProps {
  generations: Generation[];
  onUpdateImage: (file: File, metadata?: { prompt?: string; model?: string }) => void;
  onStartNewSession?: (file: File, metadata?: { prompt?: string; model?: string }) => void;
  onRetry?: (generation: Generation) => void;
}

export function GenerationsGrid({ generations, onUpdateImage, onStartNewSession, onRetry }: GenerationsGridProps) {
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
              
              {/* Model Badge */}
              {gen.model && (
                <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 text-white text-[10px] rounded-md backdrop-blur-sm font-medium pointer-events-none z-10">
                  {gen.model}
                </div>
              )}
              
              {/* Actions Bar - Always visible at bottom */}
              <div className="absolute bottom-0 left-0 right-0 p-2 bg-black/70 text-white flex items-center justify-between gap-2 backdrop-blur-sm">
                <p className="text-xs truncate flex-1 opacity-90" title={gen.prompt}>
                  {gen.prompt}
                </p>
                
                <div className="flex items-center gap-1 shrink-0">
                  {gen.file && (
                    <button 
                      onClick={() => {
                        if (onStartNewSession) {
                          onStartNewSession(gen.file!, { prompt: gen.prompt, model: gen.model });
                        } else {
                          onUpdateImage(gen.file!, { prompt: gen.prompt, model: gen.model });
                        }
                      }}
                      className="p-1.5 hover:bg-white/20 rounded-full transition-colors"
                      title="Start new project with this image"
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
            <div className="w-full h-full flex flex-col items-center justify-center text-red-500 p-4 text-center gap-2 relative">
              <AlertCircle size={24} />
              <p className="text-xs line-clamp-3 px-2">{gen.error || "Failed"}</p>
              
              {gen.model && (
                 <p className="text-[10px] opacity-50 font-mono bg-black/5 px-1.5 py-0.5 rounded">{gen.model}</p>
              )}

              {onRetry && (
                <div className="flex flex-col gap-2 mt-2 items-center">
                  {/* Show explicit Recover button if predictionId is available */}
                  {(gen.predictionId || gen.remoteUrl) ? (
                    <button 
                      onClick={() => onRetry(gen)}
                      className="flex items-center gap-1 text-xs bg-foreground text-background px-3 py-1.5 rounded-full hover:opacity-90 transition-opacity font-medium"
                    >
                      <RefreshCw size={12} />
                      Recover
                    </button>
                  ) : (
                     <button 
                      onClick={() => onRetry(gen)}
                      className="text-xs underline hover:text-red-600"
                    >
                      Retry
                    </button>
                  )}
                  
                  {/* Debug info in tooltip/hover */}
                  <div className="text-[8px] opacity-50 mt-2 font-mono">
                     {gen.id.slice(0, 6)} • {gen.provider || "?"}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-foreground/50 gap-2">
              <Loader2 size={24} className="animate-spin" />
              <p className="text-xs font-medium animate-pulse">Generating...</p>
              {gen.model && <p className="text-[10px] opacity-60 font-medium">{gen.model}</p>}
              <p className="text-[10px] opacity-70 max-w-[80%] text-center truncate">{gen.prompt}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}