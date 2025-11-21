"use client";

import React, { useState } from "react";
import { Loader2, Zap } from "lucide-react";
import { uploadToReplicate, predictReplicate, pollPrediction } from "@/lib/api";
import { ModelSelector, ModelOption } from "../ModelSelector";

interface UpscaleToolProps {
  image: File;
  onUpdateImage: (file: File, metadata?: { prompt?: string; model?: string }) => void;
  onProcessing?: (isProcessing: boolean, message?: string) => void;
}

const UPSCALE_MODELS: ModelOption[] = [
  { id: "clarity-upscaler", label: "Clarity Upscaler" },
  { id: "creative-upscaler", label: "Creative Upscaler" },
];

export function UpscaleTool({ image, onUpdateImage, onProcessing }: UpscaleToolProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("");
  const [model, setModel] = useState("clarity-upscaler");
  const [creativity, setCreativity] = useState(0.3);

  const handleGenerate = async () => {
    setIsProcessing(true);
    setStatus("Uploading image...");
    onProcessing?.(true, "Uploading image...");

    try {
      const imageUrl = await uploadToReplicate(image);
      
      setStatus("Upscaling...");
      onProcessing?.(true, "Upscaling...");
      
      let modelId = "nightmareai/real-esrgan"; // Fallback / Default
      let input: any = {
        image: imageUrl,
        scale: 2,
        face_enhance: true,
      };

      if (model === "clarity-upscaler") {
        modelId = "nightmareai/real-esrgan";
      } else if (model === "creative-upscaler") {
        modelId = "stability-ai/stable-diffusion-x4-upscaler";
        input = {
          image: imageUrl,
          prompt: "high quality, detailed", // Basic prompt for upscaler
          scale: 4,
          face_enhance: true,
        };
      }

      const prediction = await predictReplicate(modelId, input);

      let result = prediction;
      while (result.status !== "succeeded" && result.status !== "failed" && result.status !== "canceled") {
        await new Promise(r => setTimeout(r, 1000));
        result = await pollPrediction(result.id);
        setStatus(`Upscaling... ${result.status}`);
        
        let msg = `Upscaling... ${result.status}`;
        if (result.logs) {
            const lastLog = result.logs.split("\n").filter(Boolean).pop();
            if (lastLog) msg = lastLog.substring(0, 50) + "...";
        }

        onProcessing?.(true, msg);
      }

      if (result.status === "succeeded") {
        const outputUrl = result.output;
        const url = Array.isArray(outputUrl) ? outputUrl[0] : outputUrl;
        const res = await fetch(url);
        const blob = await res.blob();
        const file = new File([blob], "upscaled.png", { type: "image/png" });
        onUpdateImage(file, { prompt: "Upscale", model: modelId });
        setStatus("Done!");
        onProcessing?.(false, "Done!");
      } else {
        throw new Error(result.error || "Upscale failed");
      }
    } catch (e: any) {
      console.error(e);
      alert(e.message);
      setStatus("Error");
      onProcessing?.(false, "Error");
    } finally {
      setIsProcessing(false);
      onProcessing?.(false); // Ensure we reset if not already handled
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex-1 flex items-center justify-center bg-black/5 rounded-md p-4 overflow-hidden">
        <img
          src={URL.createObjectURL(image)}
          alt="Preview"
          className="max-h-full max-w-full object-contain"
        />
      </div>
      
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <ModelSelector 
            models={UPSCALE_MODELS} 
            selectedModelId={model} 
            onSelect={setModel} 
            className="w-64"
          />
          <button
            onClick={handleGenerate}
            disabled={isProcessing}
            className="btn-primary flex items-center gap-2"
          >
            {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
            Upscale
          </button>
        </div>
        {status && <p className="text-xs text-foreground/70">{status}</p>}
      </div>
    </div>
  );
}
