"use client";

import React, { useState } from "react";
import { Loader2, Zap, Sliders, Type } from "lucide-react";
import { uploadToReplicate, predictReplicate, pollPrediction } from "@/lib/api";
import { ModelSelector, ModelOption } from "../ModelSelector";
import { useSession, Generation } from "@/context/SessionContext";
import { GenerationsGrid } from "../GenerationsGrid";
import { uploadToGooglePhotos } from "@/lib/googlePhotos";

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
  const { activeSession, addGeneration, updateGeneration } = useSession();
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("");
  const [model, setModel] = useState("clarity-upscaler");

  // Creative Upscaler State
  const [creativity, setCreativity] = useState(0.25);
  const [resemblance, setResemblance] = useState(0.75);
  const [prompt, setPrompt] = useState("");
  const [resolution, setResolution] = useState("original");

  // Get generations for the grid
  const generations = activeSession?.generations || [];

  // Helper to download and finalize image
  const downloadAndSaveImage = async (genId: string, url: string, promptLabel: string, modelId: string) => {
    if (!activeSession) return;
    
    const res = await fetch(url);
    const blob = await res.blob();
    const file = new File([blob], "upscaled.png", { type: "image/png" });
    const localUrl = URL.createObjectURL(file);

    updateGeneration(activeSession.id, genId, {
      status: "completed",
      imageUrl: localUrl,
      file,
      model: modelId,
      error: undefined
    });

    // Update the main image too
    onUpdateImage(file, { prompt: promptLabel, model: modelId });
    
    // Auto-save to Google Photos
    const description = `Upscaled by Flux Web\nType: ${promptLabel}\nModel: ${modelId}`;
    uploadToGooglePhotos(file, description).catch(err => {
       console.log("Auto-save to GPhotos failed (non-fatal):", err);
    });
  };

  const handleRetry = async (gen: Generation) => {
    if (!activeSession) return;

    // Smart Retry Logic
    // Check predictionId regardless of provider string to be robust
    if (gen.predictionId) {
      try {
        console.log("Attempting smart recovery for upscale:", gen.id);
        updateGeneration(activeSession.id, gen.id, { status: "processing", error: undefined });
        
        let result = await pollPrediction(gen.predictionId);
        
        if (result.status === "succeeded") {
           const outputUrl = Array.isArray(result.output) ? result.output[0] : result.output;
           if (outputUrl) {
             await downloadAndSaveImage(gen.id, outputUrl, gen.prompt || "Upscale", gen.model || model);
             return;
           }
        } else if (result.status !== "failed" && result.status !== "canceled") {
           // Still running, resume polling
           while (result.status !== "succeeded" && result.status !== "failed" && result.status !== "canceled") {
              await new Promise(r => setTimeout(r, 1000));
              result = await pollPrediction(result.id);
           }
           if (result.status === "succeeded") {
             const outputUrl = Array.isArray(result.output) ? result.output[0] : result.output;
             if (outputUrl) {
               await downloadAndSaveImage(gen.id, outputUrl, gen.prompt || "Upscale", gen.model || model);
               return;
             }
           }
        }
      } catch (e) {
        console.log("Smart retry failed, falling back to fresh generation", e);
      }
    }

    // Fallback: restart generation
    console.log("Starting fresh upscale for:", gen.id);
    handleGenerate(); 
  };

  const handleGenerate = async () => {
    if (!activeSession) {
      alert("No active session selected");
      return;
    }

    const generationId = crypto.randomUUID();
    const promptLabel =
      model === "creative-upscaler" ? "Creative Upscale" : "Clarity Upscale";

    const newGeneration: Generation = {
      id: generationId,
      status: "processing",
      prompt: promptLabel,
      model,
      provider: "replicate",
      createdAt: Date.now(),
    };

    addGeneration(activeSession.id, newGeneration);

    setIsProcessing(true);
    setStatus("Uploading image...");
    onProcessing?.(true, "Uploading image...");
    
    let currentPredictionId: string | undefined;

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
        modelId = "batouresearch/magic-image-refiner"; 
        input = {
          image: imageUrl,
          prompt: prompt || "high quality, detailed", 
          creativity,
          resemblance,
          resolution,
          steps: 20,
          scheduler: "DDIM",
          guidance_scale: 7,
          hdr: 0,
          guess_mode: false,
          negative_prompt: "teeth, tooth, open mouth, longbody, lowres, bad anatomy, bad hands, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, mutant",
        };
      }

      const prediction = await predictReplicate(modelId, input);
      currentPredictionId = prediction.id;
      
      // SAVE PREDICTION ID
      updateGeneration(activeSession.id, generationId, {
        predictionId: prediction.id,
        provider: "replicate"
      });

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
        
        await downloadAndSaveImage(generationId, url, promptLabel, modelId);
        
        setStatus("Done!");
        onProcessing?.(false, "Done!");
      } else {
        throw new Error(result.error || "Upscale failed");
      }
    } catch (e: any) {
      console.error(e);
      setStatus("Error");
      onProcessing?.(false, "Error");
      
      if (activeSession) {
        const updatePayload: any = {
          status: "failed",
          error: e.message || String(e),
        };
        if (currentPredictionId) {
           updatePayload.predictionId = currentPredictionId;
           updatePayload.provider = "replicate";
        }
        updateGeneration(activeSession.id, generationId, updatePayload);
      }
    } finally {
      setIsProcessing(false);
      onProcessing?.(false); 
    }
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Top Section: Preview + Controls */}
      <div className="flex flex-col lg:flex-row gap-6 h-[60%] shrink-0 min-h-[400px]">
        {/* Large Preview */}
        <div className="flex-1 bg-black/5 rounded-lg flex items-center justify-center overflow-hidden border border-border/50 relative">
          <img
            src={URL.createObjectURL(image)}
            alt="Preview"
            className="max-h-full max-w-full object-contain"
          />
          <div className="absolute top-2 left-2 bg-black/50 text-white text-[10px] px-2 py-1 rounded-full backdrop-blur-sm">
            Current Image
          </div>
        </div>
        
        {/* Controls Sidebar */}
        <div className="w-full lg:w-80 flex flex-col gap-4 overflow-y-auto bg-background/50 p-4 rounded-lg border border-border/50">
          <div className="space-y-4">
             <ModelSelector 
                models={UPSCALE_MODELS} 
                selectedModelId={model} 
                onSelect={setModel} 
                className="w-full"
              />
              
              <button
                onClick={handleGenerate}
                disabled={isProcessing}
                className="w-full btn-primary flex items-center justify-center gap-2"
              >
                {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                Upscale
              </button>
          </div>

          {model === "creative-upscaler" && (
            <div className="flex flex-col gap-4 pt-4 border-t border-border/50 animate-in fade-in slide-in-from-top-2">
              <div className="space-y-2">
                <label className="text-xs font-medium flex items-center gap-2">
                  <Type size={12} />
                  Prompt
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe desired details..."
                  className="w-full text-sm p-2 rounded-md border bg-transparent resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  rows={3}
                />
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-medium flex items-center gap-2">
                      <Sliders size={12} />
                      Creativity
                    </label>
                    <span className="text-xs font-mono text-muted-foreground">{creativity.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={creativity}
                    onChange={(e) => setCreativity(parseFloat(e.target.value))}
                    className="w-full accent-primary h-1 bg-border rounded-lg appearance-none cursor-pointer"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Denoising strength (Higher = more change)
                  </p>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-medium flex items-center gap-2">
                      <Sliders size={12} />
                      Resemblance
                    </label>
                    <span className="text-xs font-mono text-muted-foreground">{resemblance.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={resemblance}
                    onChange={(e) => setResemblance(parseFloat(e.target.value))}
                    className="w-full accent-primary h-1 bg-border rounded-lg appearance-none cursor-pointer"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Structure preservation (Higher = closer to original)
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {status && (
            <div className="text-xs text-muted-foreground flex items-center gap-2 p-2 bg-muted rounded">
              <Loader2 size={12} className="animate-spin" />
              {status}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Section: History */}
      <div className="flex-1 overflow-y-auto min-h-[200px] border-t border-border pt-4">
          <div className="flex items-center gap-2 mb-4 px-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Session History</h3>
            <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded-full text-muted-foreground">{generations.length}</span>
          </div>
          <GenerationsGrid 
            generations={generations} 
            onUpdateImage={onUpdateImage}
            onRetry={handleRetry}
          />
      </div>
    </div>
  );
}