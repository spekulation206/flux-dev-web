"use client";

import React, { useState, useEffect } from "react";
import { Crop, Zap, Video, X, Wand2 } from "lucide-react";
import { CropMaskTool } from "./tools/CropMaskTool";
import { KontextTool } from "./tools/KontextTool";
import { UpscaleTool } from "./tools/UpscaleTool";
import { VideoTool } from "./tools/VideoTool";
import { clsx } from "clsx";

interface EditorProps {
  image: File;
  onReset: () => void;
  onUpdateImage: (file: File, metadata?: { prompt?: string; model?: string }) => void;
  onUpdateStatus: (status: "idle" | "processing" | "completed" | "error", message?: string) => void;
}

type Tab = "crop" | "kontext" | "upscale" | "video";

export function Editor({ image, onReset, onUpdateImage, onUpdateStatus }: EditorProps) {
  const [activeTab, setActiveTab] = useState<Tab>("kontext");
  
  // We use the prop 'image' as the source of truth.
  // When a tool updates the image, it calls onUpdateImage, which updates the SessionContext,
  // which re-renders Editor with the new image.

  // Wrapper to handle status updates from tools
  const handleImageUpdate = (file: File, metadata?: { prompt?: string; model?: string }) => {
    onUpdateImage(file, metadata);
    onUpdateStatus("completed", "Done!");
    setTimeout(() => onUpdateStatus("idle"), 2000);
  };

  const handleProcessing = (isProcessing: boolean, message?: string) => {
    onUpdateStatus(isProcessing ? "processing" : "idle", message);
  };

  const tabs = [
    { id: "kontext", label: "Kontext", icon: Wand2 },
    { id: "upscale", label: "Upscale", icon: Zap },
    { id: "crop", label: "Crop", icon: Crop },
    { id: "video", label: "Video", icon: Video },
  ] as const;

  return (
    <div className="w-full flex flex-col gap-4 h-full pb-20 md:pb-0 relative">
      {/* Desktop Tabs - Hidden on Mobile */}
      <div className="hidden md:flex justify-between items-center">
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "flex items-center gap-2 px-4 py-2 rounded-sm border transition-all",
                activeTab === tab.id
                  ? "bg-foreground text-background border-foreground"
                  : "bg-transparent text-foreground border-transparent hover:border-border"
              )}
            >
              <tab.icon size={16} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
        <button
          onClick={onReset}
          className="p-2 hover:bg-foreground/10 rounded-sm text-foreground/70 hover:text-foreground transition-colors"
          title="Close / Reset"
        >
          <X size={20} />
        </button>
      </div>

      {/* Content Area */}
      <div className="w-full flex-1 min-h-0 md:border border-border rounded-lg md:p-4 bg-background/50 overflow-hidden">
        {activeTab === "crop" && (
          <CropMaskTool 
            image={image} 
            onUpdateImage={handleImageUpdate} 
          />
        )}
        {activeTab === "kontext" && (
          <KontextTool 
            image={image} 
            onUpdateImage={handleImageUpdate} 
            onProcessing={handleProcessing}
          />
        )}
        {activeTab === "upscale" && (
          <UpscaleTool 
            image={image} 
            onUpdateImage={handleImageUpdate}
            onProcessing={handleProcessing}
          />
        )}
        {activeTab === "video" && (
          <VideoTool 
            image={image} 
          />
        )}
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border flex justify-around p-2 z-50">
         {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "flex flex-col items-center gap-1 p-2 rounded-md transition-all flex-1",
                activeTab === tab.id
                  ? "text-foreground"
                  : "text-foreground/50"
              )}
            >
              <tab.icon size={20} />
              <span className="text-[10px] font-medium uppercase tracking-wide">{tab.label}</span>
            </button>
          ))}
      </div>
    </div>
  );
}
