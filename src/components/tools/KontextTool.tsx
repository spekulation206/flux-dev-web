"use client";

import React, { useState, useEffect, useRef } from "react";
import { Loader2, Wand2, AlertCircle, Check, Download, Plus, X } from "lucide-react";
import { uploadToReplicate, predictReplicate, pollPrediction, generateGemini } from "@/lib/api";
import { resizeImage } from "@/lib/utils";
import { ModelSelector, ModelOption } from "../ModelSelector";
import { PromptInput } from "../PromptInput";
import { useLocalStorage } from "@/lib/hooks";
import { useSession, Generation } from "@/context/SessionContext";
import { uploadToGooglePhotos } from "@/lib/googlePhotos";
import { GenerationsGrid } from "../GenerationsGrid";

interface KontextToolProps {
  image: File;
  onUpdateImage: (file: File, metadata?: { prompt?: string; model?: string }) => void;
  onProcessing?: (isProcessing: boolean, message?: string) => void;
}

const KONTEXT_MODELS: ModelOption[] = [
  { id: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash (Nano Banana)", provider: "gemini" },
  { id: "gemini-3-pro-image-preview", label: "Nano Banana Pro", provider: "gemini" },
  { id: "flux-2-dev", label: "Flux 2 Dev", provider: "replicate" },
  { id: "flux-2-pro", label: "Flux 2 Pro", provider: "replicate" },
  { id: "flux-2-flex", label: "Flux 2 Flex", provider: "replicate" },
  { id: "qwen-image-edit", label: "Qwen Image Edit", provider: "replicate" },
  { id: "seedream-4.5", label: "Seedream 4.5", provider: "replicate" },
];

export function KontextTool({ image, onUpdateImage, onProcessing }: KontextToolProps) {
  const { activeSession, addGeneration, updateGeneration, addAdditionalImage, removeAdditionalImage, createSessionWithReferences } = useSession();
  const [isolate, setIsolate] = useState(false);
  const [model, setModel] = useLocalStorage("last_model", "gemini-2.5-flash-image");
  const [resolution, setResolution] = useState("1K");
  const [goFast, setGoFast] = useState(true); // For Flux 2 Dev
  const [flux2ProResolution, setFlux2ProResolution] = useState("1 MP"); // For Flux 2 Pro
  const [seedreamSize, setSeedreamSize] = useState<"2K" | "4K" | "custom">("2K"); // For Seedream 4.5
  const [seedreamAspectRatio, setSeedreamAspectRatio] = useState("match_input_image"); // For Seedream 4.5
  const [seedreamWidth, setSeedreamWidth] = useState(2048); // For Seedream 4.5 custom
  const [seedreamHeight, setSeedreamHeight] = useState(2048); // For Seedream 4.5 custom
  const [seedreamSequential, setSeedreamSequential] = useState<"disabled" | "auto">("disabled"); // For Seedream 4.5
  const [seedreamMaxImages, setSeedreamMaxImages] = useState(1); // For Seedream 4.5
  
  // Local backup for recovery in case of state race conditions
  const lastPredictionIdRef = useRef<string | null>(null);

  // Validate model - ensure it exists in current list
  useEffect(() => {
    const isValidModel = KONTEXT_MODELS.find(m => m.id === model);
    if (!isValidModel) {
      setModel("gemini-2.5-flash-image");
    }
  }, [model, setModel]);

  // Use generations from session, default to empty array
  const generations = activeSession?.generations || [];

  const handleStartNewSession = (file: File, metadata?: { prompt?: string; model?: string }) => {
    if (!activeSession) return;
    createSessionWithReferences(file, activeSession.additionalImages);
  };

  const handleGenerate = async (promptText: string) => {
    if (!promptText) {
      alert("Please enter a prompt");
      return;
    }

    const generationId = crypto.randomUUID();
    const selectedModel = KONTEXT_MODELS.find(m => m.id === model);
    
    const newGeneration: Generation = {
      id: generationId,
      status: "queued",
      prompt: promptText,
      model,
      provider: (selectedModel?.provider || "other") as "replicate" | "gemini" | "other",
      createdAt: Date.now(),
    };

    if (activeSession) {
      addGeneration(activeSession.id, newGeneration);
    }

    // Start generation in background
    generateImage(
      generationId, 
      promptText, 
      model, 
      isolate, 
      resolution, 
      goFast, 
      flux2ProResolution,
      seedreamSize,
      seedreamAspectRatio,
      seedreamWidth,
      seedreamHeight,
      seedreamSequential,
      seedreamMaxImages
    );
  };

  // Helper to download and finalize image
  const downloadAndSaveImage = async (genId: string, url: string, prompt: string, modelId: string) => {
    if (!activeSession) return;
    
    const res = await fetch(url);
    const blob = await res.blob();
    
    // Determine mime type from blob or default to png
    const type = blob.type || "image/png";
    const ext = type.split("/")[1] || "png";
    
    const generatedFile = new File([blob], `generated_${genId}.${ext}`, { type });
    const localUrl = URL.createObjectURL(generatedFile);
    
    updateGeneration(activeSession.id, genId, { 
      status: "completed", 
      imageUrl: localUrl, 
      file: generatedFile,
      error: undefined // Clear any previous errors
    });

    // Auto-save to Google Photos
    const description = `Generated by Flux Web\nPrompt: ${prompt}\nModel: ${modelId}`;
    uploadToGooglePhotos(generatedFile, description)
      .then(() => console.log("Auto-saved generation to Google Photos"))
      .catch(err => {
        if (err.message !== "Google Photos not connected") {
          console.error("Failed to auto-save to Google Photos:", err);
        }
      });
  };

  const handleRetry = async (gen: Generation) => {
    if (!activeSession) return;

    console.log(`Retry requested for ${gen.id}. Provider: ${gen.provider}, PredictionId: ${gen.predictionId}, RemoteUrl: ${gen.remoteUrl}`);
    
    // Fallback: check local ref if ID matches (simple heuristic)
    let predictionId = gen.predictionId;
    if (!predictionId && lastPredictionIdRef.current) {
       // Only use local ref if it seems plausible (e.g. same prompt/model context - but here we just try it)
       console.log("Using local backup prediction ID");
       predictionId = lastPredictionIdRef.current;
    }

    // 1. Try Remote URL Recovery (Fastest)
    if (gen.remoteUrl) {
      try {
        console.log("Attempting recovery via remoteUrl...");
        updateGeneration(activeSession.id, gen.id, { status: "processing", error: undefined });
        await downloadAndSaveImage(gen.id, gen.remoteUrl, gen.prompt || "", gen.model || "");
        return;
      } catch (e) {
        console.warn("Remote URL recovery failed:", e);
        // Fall through to polling or fresh generation
      }
    }

    // 2. Try Replicate Prediction Polling
    // Check predictionId existence regardless of provider string to be safe
    if (predictionId) {
      try {
        console.log("Attempting smart recovery via predictionId:", predictionId);
        updateGeneration(activeSession.id, gen.id, { status: "processing", error: undefined, predictionId }); // Ensure ID is saved if recovered from local ref
        
        let result = await pollPrediction(predictionId);
        
        if (result.status === "succeeded") {
           const outputUrl = Array.isArray(result.output) ? result.output[0] : result.output;
           if (outputUrl) {
             updateGeneration(activeSession.id, gen.id, { remoteUrl: outputUrl });
             await downloadAndSaveImage(gen.id, outputUrl, gen.prompt || "", gen.model || "");
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
                updateGeneration(activeSession.id, gen.id, { remoteUrl: outputUrl });
                await downloadAndSaveImage(gen.id, outputUrl, gen.prompt || "", gen.model || "");
                return;
             }
           }
        }
      } catch (e) {
        console.log("Smart retry failed, falling back to fresh generation", e);
      }
    }

    // 3. Fallback to Fresh Generation
    console.log("Starting fresh generation for:", gen.id);
    generateImage(
      gen.id, 
      gen.prompt || "", 
      gen.model || "", 
      false, 
      resolution, 
      goFast, 
      flux2ProResolution,
      seedreamSize,
      seedreamAspectRatio,
      seedreamWidth,
      seedreamHeight,
      seedreamSequential,
      seedreamMaxImages
    );
  };

  const generateImage = async (
    genId: string, 
    promptText: string, 
    modelId: string, 
    shouldIsolate: boolean,
    resolutionVal: string = "1K",
    goFastVal: boolean = true,
    flux2ProRes: string = "1 MP",
    seedreamSizeVal: "2K" | "4K" | "custom" = "2K",
    seedreamAspectRatioVal: string = "match_input_image",
    seedreamWidthVal: number = 2048,
    seedreamHeightVal: number = 2048,
    seedreamSequentialVal: "disabled" | "auto" = "disabled",
    seedreamMaxImagesVal: number = 1
  ) => {
    if (!activeSession) return;
    
    // Track current prediction ID for this run
    let currentPredictionId: string | undefined;

    try {
      updateGeneration(activeSession.id, genId, { status: "processing", error: undefined });

      const selectedModel = KONTEXT_MODELS.find(m => m.id === modelId);

      // Resize image based on target resolution
      let maxDim = 1024;
      if (modelId === "seedream-4.5") {
        // Seedream 4.5 uses size parameter
        if (seedreamSizeVal === "2K") maxDim = 2048;
        else if (seedreamSizeVal === "4K") maxDim = 4096;
        else if (seedreamSizeVal === "custom") {
          // For custom, use the larger dimension
          maxDim = Math.max(seedreamWidthVal, seedreamHeightVal);
        }
      } else {
        // Other models use resolutionVal
        if (resolutionVal === "2K") maxDim = 2048;
        if (resolutionVal === "4K") maxDim = 4096;
      }

      const base64Image = await resizeImage(image, maxDim);

      // Prepare additional images
      const additionalImages = activeSession?.additionalImages || [];
      const additionalImagesBase64: string[] = [];
      const additionalImagesUrls: string[] = [];

      if (selectedModel?.provider === "gemini") {
        for (const img of additionalImages) {
          const b64 = await resizeImage(img, maxDim);
          additionalImagesBase64.push(b64);
        }
      } else {
        // For Replicate, we need to upload them
        for (const img of additionalImages) {
           // Replicate upload logic
           const b64 = await resizeImage(img, maxDim);
           const res = await fetch(b64);
           const blob = await res.blob();
           const fileToUpload = new File([blob], "additional_input.jpg", { type: "image/jpeg" });
           const url = await uploadToReplicate(fileToUpload);
           additionalImagesUrls.push(url);
        }
      }

      if (selectedModel?.provider === "gemini") {
        // Gemini Flow
        let finalPrompt = promptText;
        if (shouldIsolate) finalPrompt += " (isolate subject)";

        const result = await generateGemini(finalPrompt, base64Image, modelId, resolutionVal, additionalImagesBase64);
        
        let imageB64: string | null = null;
        let responseText = "";

        console.log("Gemini Response Structure:", JSON.stringify(result, null, 2));

        if (result.candidates && result.candidates[0]?.content?.parts) {
           for (const part of result.candidates[0].content.parts) {
             if (part.inline_data && part.inline_data.mime_type?.startsWith("image/")) {
               imageB64 = part.inline_data.data;
               break;
             }
             if (part.inlineData && part.inlineData.mimeType?.startsWith("image/")) {
               imageB64 = part.inlineData.data;
               break;
             }
           }
        }

        if (!imageB64) {
           if (result.candidates && result.candidates[0]?.content?.parts) {
             responseText = result.candidates[0].content.parts
               .filter((p: any) => p.text)
               .map((p: any) => p.text)
               .join(" ") || "";
           } else if (typeof result === 'string') {
             responseText = result;
           }

           try {
             const jsonMatch = responseText.match(/\{[\s\S]*\}/);
             if (jsonMatch) {
                const json = JSON.parse(jsonMatch[0]);
                imageB64 = json.base64_image;
             }
           } catch (e) {
             console.log("No JSON found in text response");
           }
        }

        if (imageB64) {
          const res = await fetch(`data:image/png;base64,${imageB64}`);
          const blob = await res.blob();
          const generatedFile = new File([blob], `gemini_${genId}.png`, { type: "image/png" });
          const imageUrl = URL.createObjectURL(generatedFile);
          
          updateGeneration(activeSession.id, genId, { 
            status: "completed", 
            imageUrl, 
            file: generatedFile 
          });

          // Auto-save (duplicated logic but cleaner inline for Gemini flow which doesn't use polling)
          const description = `Generated by Flux Web\nPrompt: ${promptText}\nModel: ${modelId}`;
          uploadToGooglePhotos(generatedFile, description).catch(() => {});
          
        } else {
          throw new Error(responseText || "No image found in Gemini response");
        }

      } else {
        // Replicate Flow
        const res = await fetch(base64Image);
        const blob = await res.blob();
        const resizedFile = new File([blob], "resized_input.jpg", { type: "image/jpeg" });
        
        const imageUrlInput = await uploadToReplicate(resizedFile);
        
        let finalPrompt = promptText;
        if (shouldIsolate) finalPrompt += " please leave the rest of the image untouched.";

        let replicateModelId = "black-forest-labs/flux-2-dev";
        let input: any = {
          prompt: finalPrompt,
          input_images: [imageUrlInput, ...additionalImagesUrls],
          aspect_ratio: "match_input_image",
          output_format: "jpg",
          go_fast: goFastVal,
          disable_safety_checker: true
        };

        if (modelId === "flux-2-pro") {
          replicateModelId = "black-forest-labs/flux-2-pro";
          input = {
            prompt: finalPrompt,
            input_images: [imageUrlInput, ...additionalImagesUrls],
            aspect_ratio: "match_input_image",
            resolution: flux2ProRes,
            output_format: "webp",
            safety_tolerance: 5
          };
        } else if (modelId === "flux-2-flex") {
          replicateModelId = "black-forest-labs/flux-2-flex";
          input = {
            prompt: finalPrompt,
            input_images: [imageUrlInput, ...additionalImagesUrls],
            aspect_ratio: "match_input_image",
            resolution: flux2ProRes,
            output_format: "webp",
            prompt_upsampling: false,
            safety_tolerance: 5
          };
        } else if (modelId === "qwen-image-edit") {
          replicateModelId = "qwen/qwen-image-edit";
          input = {
            image: imageUrlInput,
            prompt: finalPrompt,
            output_quality: 80,
            disable_safety_checker: true
          };
        } else if (modelId === "seedream-4.5") {
          replicateModelId = "bytedance/seedream-4.5";
          input = {
            prompt: finalPrompt,
            image_input: [imageUrlInput, ...additionalImagesUrls],
            size: seedreamSizeVal,
            aspect_ratio: seedreamAspectRatioVal,
            sequential_image_generation: seedreamSequentialVal,
            max_images: seedreamMaxImagesVal
          };
          
          // Add custom dimensions if size is "custom"
          if (seedreamSizeVal === "custom") {
            input.width = seedreamWidthVal;
            input.height = seedreamHeightVal;
          }
        }

        const prediction = await predictReplicate(replicateModelId, input);
        
        // IMPORTANT: Save prediction ID immediately for recovery
        currentPredictionId = prediction.id;
        lastPredictionIdRef.current = prediction.id;
        
        updateGeneration(activeSession.id, genId, { 
          predictionId: prediction.id,
          provider: "replicate"
        });

        let result = prediction;
        
        while (result.status !== "succeeded" && result.status !== "failed" && result.status !== "canceled") {
          await new Promise(r => setTimeout(r, 1000));
          result = await pollPrediction(result.id);
        }

        if (result.status === "succeeded") {
          const outputUrl = Array.isArray(result.output) ? result.output[0] : result.output;
          
          // Save remote URL immediately so we can retry download if needed
          if (outputUrl) {
            updateGeneration(activeSession.id, genId, { remoteUrl: outputUrl });
          }

          await downloadAndSaveImage(genId, outputUrl, promptText, modelId);
        } else {
          throw new Error(result.error || "Generation failed");
        }
      }

    } catch (e: any) {
      console.error(e);
      
      // Ensure we preserve the predictionId if we have it
      const updatePayload: any = { 
        status: "failed", 
        error: e.message 
      };
      
      if (currentPredictionId) {
        updatePayload.predictionId = currentPredictionId;
        updatePayload.provider = "replicate";
      }
      
      updateGeneration(activeSession!.id, genId, updatePayload);
    }
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Top Section: Thumbnail + Controls */}
      <div className="flex flex-col md:flex-row gap-4 items-start bg-black/5 p-4 rounded-lg">
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 overflow-x-auto pb-2">
             {/* Main Image */}
            <div className="shrink-0 w-20 h-20 md:w-24 md:h-24 bg-background rounded border border-border overflow-hidden relative group">
              <img
                src={URL.createObjectURL(image)}
                alt="Original"
                className="w-full h-full object-contain"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-medium">
                Original
              </div>
            </div>

            {/* Additional Images */}
            {activeSession?.additionalImages.map((img, idx) => (
              <div 
                key={idx} 
                className="shrink-0 w-20 h-20 md:w-24 md:h-24 bg-background rounded border border-border overflow-hidden relative group cursor-pointer"
                onClick={() => {
                  if (window.confirm("Delete this reference image?")) {
                    removeAdditionalImage(activeSession.id, idx);
                  }
                }}
              >
                <img
                  src={URL.createObjectURL(img)}
                  alt={`Additional ${idx}`}
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeAdditionalImage(activeSession.id, idx);
                  }}
                  className="absolute top-1 right-1 bg-black/50 hover:bg-black/70 text-white rounded-full p-0.5 transition-opacity"
                >
                  <X size={12} />
                </button>
              </div>
            ))}

            {/* Add Image Button */}
            <label className="shrink-0 w-20 h-20 md:w-24 md:h-24 bg-background rounded border border-border border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-foreground/5 transition-colors text-foreground/50 hover:text-foreground">
              <Plus size={24} />
              <span className="text-[10px] font-medium">Add Ref</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && activeSession) {
                    Array.from(e.target.files).forEach(file => {
                      addAdditionalImage(activeSession.id, file);
                    });
                  }
                }}
              />
            </label>
          </div>
        </div>
      
        {/* Controls */}
        <div className="flex-1 w-full flex flex-col gap-3">
           <div className="flex flex-wrap gap-3 items-center">
          <ModelSelector 
            models={KONTEXT_MODELS} 
            selectedModelId={model} 
            onSelect={setModel} 
              className="flex-1 min-w-[200px]"
          />
            
            {model === "gemini-3-pro-image-preview" && (
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                className="bg-transparent border border-foreground rounded-sm px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-foreground cursor-pointer"
              >
                <option value="1K" className="bg-background text-foreground">1K</option>
                <option value="2K" className="bg-background text-foreground">2K</option>
                <option value="4K" className="bg-background text-foreground">4K</option>
              </select>
            )}

            {model === "flux-2-dev" && (
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none whitespace-nowrap">
                <input 
                  type="checkbox" 
                  checked={goFast} 
                  onChange={(e) => setGoFast(e.target.checked)}
                  className="rounded border-foreground/30 text-foreground focus:ring-foreground"
                />
                Go Fast
              </label>
            )}

            {(model === "flux-2-pro" || model === "flux-2-flex") && (
              <select
                value={flux2ProResolution}
                onChange={(e) => setFlux2ProResolution(e.target.value)}
                className="bg-transparent border border-foreground rounded-sm px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-foreground cursor-pointer"
              >
                <option value="0.5 MP" className="bg-background text-foreground">0.5 MP</option>
                <option value="1 MP" className="bg-background text-foreground">1 MP</option>
                <option value="2 MP" className="bg-background text-foreground">2 MP</option>
                <option value="4 MP" className="bg-background text-foreground">4 MP</option>
              </select>
            )}

            {model === "seedream-4.5" && (
              <>
                <select
                  value={seedreamSize}
                  onChange={(e) => setSeedreamSize(e.target.value as "2K" | "4K" | "custom")}
                  className="bg-transparent border border-foreground rounded-sm px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-foreground cursor-pointer"
                >
                  <option value="2K" className="bg-background text-foreground">2K</option>
                  <option value="4K" className="bg-background text-foreground">4K</option>
                  <option value="custom" className="bg-background text-foreground">Custom</option>
                </select>
                
                {seedreamSize !== "custom" && (
                  <select
                    value={seedreamAspectRatio}
                    onChange={(e) => setSeedreamAspectRatio(e.target.value)}
                    className="bg-transparent border border-foreground rounded-sm px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-foreground cursor-pointer"
                  >
                    <option value="match_input_image" className="bg-background text-foreground">Match Input</option>
                    <option value="1:1" className="bg-background text-foreground">1:1</option>
                    <option value="4:3" className="bg-background text-foreground">4:3</option>
                    <option value="3:4" className="bg-background text-foreground">3:4</option>
                    <option value="16:9" className="bg-background text-foreground">16:9</option>
                    <option value="9:16" className="bg-background text-foreground">9:16</option>
                    <option value="3:2" className="bg-background text-foreground">3:2</option>
                    <option value="2:3" className="bg-background text-foreground">2:3</option>
                    <option value="21:9" className="bg-background text-foreground">21:9</option>
                  </select>
                )}
                
                {seedreamSize === "custom" && (
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      value={seedreamWidth}
                      onChange={(e) => setSeedreamWidth(Math.max(1024, Math.min(4096, parseInt(e.target.value) || 2048)))}
                      min={1024}
                      max={4096}
                      className="bg-transparent border border-foreground rounded-sm px-2 py-1.5 text-sm w-20 focus:outline-none focus:ring-1 focus:ring-foreground"
                      placeholder="Width"
                    />
                    <span className="text-sm">×</span>
                    <input
                      type="number"
                      value={seedreamHeight}
                      onChange={(e) => setSeedreamHeight(Math.max(1024, Math.min(4096, parseInt(e.target.value) || 2048)))}
                      min={1024}
                      max={4096}
                      className="bg-transparent border border-foreground rounded-sm px-2 py-1.5 text-sm w-20 focus:outline-none focus:ring-1 focus:ring-foreground"
                      placeholder="Height"
                    />
                  </div>
                )}
                
                <select
                  value={seedreamSequential}
                  onChange={(e) => setSeedreamSequential(e.target.value as "disabled" | "auto")}
                  className="bg-transparent border border-foreground rounded-sm px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-foreground cursor-pointer"
                >
                  <option value="disabled" className="bg-background text-foreground">Single Image</option>
                  <option value="auto" className="bg-background text-foreground">Sequential (Auto)</option>
                </select>
                
                {seedreamSequential === "auto" && (
                  <input
                    type="number"
                    value={seedreamMaxImages}
                    onChange={(e) => setSeedreamMaxImages(Math.max(1, Math.min(15, parseInt(e.target.value) || 1)))}
                    min={1}
                    max={15}
                    className="bg-transparent border border-foreground rounded-sm px-2 py-1.5 text-sm w-20 focus:outline-none focus:ring-1 focus:ring-foreground"
                    placeholder="Max"
                    title="Max images (1-15)"
                  />
                )}
              </>
            )}

            <label className="flex items-center gap-2 text-sm cursor-pointer select-none whitespace-nowrap">
            <input 
              type="checkbox" 
              checked={isolate} 
              onChange={(e) => setIsolate(e.target.checked)}
                className="rounded border-foreground/30 text-foreground focus:ring-foreground"
            />
            Isolate Subject
          </label>
        </div>

          <div className="flex gap-2">
            <PromptInput
              onSubmit={handleGenerate}
              placeholder="Describe what to change..."
              buttonLabel="Generate"
              className="w-full"
              section="kontext"
            />
          </div>
        </div>
      </div>

      {/* Generations Grid */}
      <div className="flex-1 overflow-y-auto min-h-[300px]">
        <GenerationsGrid 
          generations={generations} 
          onUpdateImage={onUpdateImage}
          onStartNewSession={handleStartNewSession}
          onRetry={handleRetry}
        />
      </div>
    </div>
  );
}