"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Loader2, Wand2, Check, Undo, Eraser, Crop as CropIcon, Brush } from "lucide-react";
import { fileToDataUrl, canvasToBlob, cn } from "@/lib/utils";
import { uploadToReplicate, predictReplicate, pollPrediction } from "@/lib/api";
import { ModelSelector, ModelOption } from "../ModelSelector";
import { PromptInput } from "../PromptInput";

interface CropMaskToolProps {
  image: File;
  onUpdateImage: (file: File, metadata?: { prompt?: string; model?: string }) => void;
}

const FILL_MODELS: ModelOption[] = [
  { id: "flux-fill-dev", label: "Flux Fill Dev" },
  { id: "flux-fill-pro", label: "Flux Fill Pro" },
];

function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number) {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight,
    ),
    mediaWidth,
    mediaHeight,
  );
}

export function CropMaskTool({ image, onUpdateImage }: CropMaskToolProps) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [mode, setMode] = useState<"crop" | "mask">("crop");
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("");
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [brushSize, setBrushSize] = useState(20);
  const [isDrawing, setIsDrawing] = useState(false);
  const [model, setModel] = useState("flux-fill-dev");

  // Load image
  useEffect(() => {
    if (image) {
      setCrop(undefined); // Reset crop
      fileToDataUrl(image).then(setImgSrc);
    }
  }, [image]);

  // Initialize canvas when mode switches to mask
  useEffect(() => {
    if (mode === "mask" && imgRef.current && canvasRef.current && containerRef.current) {
      const canvas = canvasRef.current;
      const img = imgRef.current;
      const ctx = canvas.getContext("2d");

      // Match canvas size to image display size
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      // Draw the current image onto the canvas (as background reference? No, we want a mask)
      // Actually we want to draw on top.
      // Let's make the canvas transparent initially
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // If we had a crop, we should probably respect it, but for now assume full image masking
        // or we can fill with black (keep) and draw white (mask)
        
        // For Inpainting: White = Mask (change), Black = Keep
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [mode, imgSrc]);

  const handleGenerate = async (promptText: string) => {
    if (!promptText) {
      alert("Please enter a prompt");
      return;
    }
    setIsProcessing(true);
    setStatus("Uploading images...");

    try {
      // 1. Upload Image
      const imageUrl = await uploadToReplicate(image);
      
      // 2. Upload Mask
      let maskUrl = null;
      if (canvasRef.current) {
        const maskBlob = await canvasToBlob(canvasRef.current);
        const maskFile = new File([maskBlob], "mask.png", { type: "image/png" });
        maskUrl = await uploadToReplicate(maskFile);
      }

      if (!maskUrl) {
        throw new Error("Mask is required");
      }

      // 3. Predict
      setStatus("Generating...");
      
      let modelId = "black-forest-labs/flux-fill-dev";
      if (model === "flux-fill-pro") {
        modelId = "black-forest-labs/flux-fill-pro";
      }

      const prediction = await predictReplicate(modelId, {
        prompt: promptText,
        image: imageUrl,
        mask: maskUrl,
        output_format: "png",
        disable_safety_checker: true
      });

      // 4. Poll
      let result = prediction;
      while (result.status !== "succeeded" && result.status !== "failed" && result.status !== "canceled") {
        await new Promise(r => setTimeout(r, 1000));
        result = await pollPrediction(result.id);
        setStatus(`Generating... ${result.status}`);
      }

      if (result.status === "succeeded") {
        const outputUrl = result.output;
        const url = Array.isArray(outputUrl) ? outputUrl[0] : outputUrl;
        
        const res = await fetch(url);
        const blob = await res.blob();
        const file = new File([blob], "generated.png", { type: "image/png" });
        onUpdateImage(file, { prompt: promptText, model: modelId });
        setMode("crop");
        setStatus("Done!");
      } else {
        throw new Error(result.error || "Generation failed");
      }
    } catch (e: any) {
      console.error(e);
      alert(e.message);
      setStatus("Error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCrop = async () => {
    if (completedCrop && imgRef.current) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
      const scaleY = imgRef.current.naturalHeight / imgRef.current.height;

      canvas.width = completedCrop.width * scaleX;
      canvas.height = completedCrop.height * scaleY;

      ctx.drawImage(
        imgRef.current,
        completedCrop.x * scaleX,
        completedCrop.y * scaleY,
        completedCrop.width * scaleX,
        completedCrop.height * scaleY,
        0,
        0,
        completedCrop.width * scaleX,
        completedCrop.height * scaleY,
      );

      const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'));
      if (blob) {
        const file = new File([blob], "cropped.png", { type: "image/png" });
        onUpdateImage(file, { prompt: "Cropped image", model: "Crop Tool" });
      }
    }
  };

  // Drawing handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
       // Optional: Save history?
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current || !imgRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Get coordinates relative to canvas
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);

    ctx.lineWidth = brushSize * (canvas.width / rect.width); // Scale brush
    ctx.lineCap = "round";
    ctx.strokeStyle = "white";
    
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  // Reset path on start
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
     const ctx = canvasRef.current?.getContext("2d");
     ctx?.beginPath();
     startDrawing(e);
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex-1 relative bg-black/5 rounded-md overflow-hidden flex items-center justify-center" ref={containerRef}>
         {mode === "crop" && (
           <ReactCrop
             crop={crop}
             onChange={(_, percentCrop) => setCrop(percentCrop)}
             onComplete={(c) => setCompletedCrop(c)}
             aspect={undefined}
             className="max-h-[400px]"
           >
             {imgSrc && <img ref={imgRef} src={imgSrc} alt="Crop" className="max-h-[400px] object-contain" onLoad={(e) => {
                const { width, height } = e.currentTarget;
                setCrop(centerAspectCrop(width, height, 16 / 9));
             }} />}
           </ReactCrop>
         )}

         {mode === "mask" && imgSrc && (
            <div className="relative max-h-[400px]">
               <img ref={imgRef} src={imgSrc} alt="Mask Background" className="max-h-[400px] object-contain pointer-events-none" />
               <canvas
                 ref={canvasRef}
                 className="absolute inset-0 w-full h-full touch-none opacity-50"
                 onMouseDown={handleMouseDown}
                 onMouseMove={draw}
                 onMouseUp={stopDrawing}
                 onMouseLeave={stopDrawing}
                 onTouchStart={(e) => {
                    const ctx = canvasRef.current?.getContext("2d");
                    ctx?.beginPath();
                    startDrawing(e);
                 }}
                 onTouchMove={draw}
                 onTouchEnd={stopDrawing}
               />
            </div>
         )}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex gap-2 bg-muted/20 p-1 rounded-md w-fit">
           <button 
             onClick={() => setMode("crop")}
             className={cn("px-3 py-1.5 rounded text-sm font-medium flex items-center gap-2", mode === "crop" ? "bg-background shadow-sm text-foreground" : "text-foreground/60")}
           >
             <CropIcon size={14} /> Crop
           </button>
           <button 
             onClick={() => setMode("mask")}
             className={cn("px-3 py-1.5 rounded text-sm font-medium flex items-center gap-2", mode === "mask" ? "bg-background shadow-sm text-foreground" : "text-foreground/60")}
           >
             <Brush size={14} /> Inpaint
           </button>
        </div>

        {mode === "crop" ? (
          <div className="flex justify-end">
             <button onClick={handleCrop} className="btn-primary flex items-center gap-2">
               <Check size={16} /> Apply Crop
             </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
             <div className="flex items-center gap-4">
                <span className="text-sm font-medium">Brush Size</span>
                <input 
                  type="range" 
                  min="5" 
                  max="100" 
                  value={brushSize} 
                  onChange={(e) => setBrushSize(Number(e.target.value))} 
                  className="flex-1"
                />
             </div>
             
             <div className="flex gap-2">
                 <ModelSelector 
                    models={FILL_MODELS} 
                    selectedModelId={model} 
                    onSelect={setModel} 
                    className="w-48"
                 />
                 <PromptInput
                    onSubmit={handleGenerate}
                    placeholder="Describe what to fill..."
                    buttonLabel="Fill"
                    isProcessing={isProcessing}
                    className="flex-1"
                    section="fill"
                 />
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
