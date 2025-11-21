"use client";

import React, { useCallback } from "react";
import { Upload } from "lucide-react";

interface ImageUploaderProps {
  onImageSelect: (file: File) => void;
}

export function ImageUploader({ onImageSelect }: ImageUploaderProps) {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        onImageSelect(e.dataTransfer.files[0]);
      }
    },
    [onImageSelect]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        onImageSelect(e.target.files[0]);
      }
    },
    [onImageSelect]
  );

  return (
    <div
      className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-border rounded-lg bg-background hover:bg-foreground/5 transition-colors cursor-pointer"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => document.getElementById("fileInput")?.click()}
    >
      <Upload size={48} className="text-foreground/50 mb-4" />
      <p className="text-foreground/70 font-medium">
        Drag & drop an image here, or click to select
      </p>
      <input
        id="fileInput"
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}

