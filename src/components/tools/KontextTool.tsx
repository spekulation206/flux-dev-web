"use client";

import React, { useState, useEffect } from "react";
import { Loader2, Wand2, AlertCircle, Check, Download } from "lucide-react";
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
  { id: "flux-kontext-dev", label: "Flux Kontext Dev", provider: "replicate" },
  { id: "flux-kontext-pro", label: "Flux Kontext Pro", provider: "replicate" },
  { id: "flux-kontext-max", label: "Flux Kontext Max", provider: "replicate" },
  { id: "qwen-image-edit", label: "Qwen Image Edit", provider: "replicate" },
  { id: "seedream-4", label: "Seedream 4", provider: "replicate" },
];

export function KontextTool({ image, onUpdateImage, onProcessing }: KontextToolProps) {
  const { activeSession, addGeneration, updateGeneration } = useSession();
  const [isolate, setIsolate] = useState(false);
  const [model, setModel] = useLocalStorage("last_model", "gemini-2.5-flash-image");
  const [resolution, setResolution] = useState("1K");

  // Validate model - ensure it exists in current list
  useEffect(() => {
    const isValidModel = KONTEXT_MODELS.find(m => m.id === model);
    if (!isValidModel) {
      setModel("gemini-2.5-flash-image");
    }
  }, [model, setModel]);

  // Use generations from session, default to empty array
  const generations = activeSession?.generations || [];

  const handleGenerate = async (promptText: string) => {
    if (!promptText) {
      alert("Please enter a prompt");
      return;
    }

    const generationId = crypto.randomUUID();
    const newGeneration: Generation = {
      id: generationId,
      status: "queued",
      prompt: promptText,
      model,
      createdAt: Date.now(),
    };

    if (activeSession) {
      addGeneration(activeSession.id, newGeneration);
    }

    // Start generation in background
    generateImage(generationId, promptText, model, isolate, resolution);
  };

  const generateImage = async (
    genId: string, 
    promptText: string, 
    modelId: string, 
    shouldIsolate: boolean,
    resolutionVal: string = "1K"
  ) => {
    if (!activeSession) return;
    
    try {
      updateGeneration(activeSession.id, genId, { status: "processing" });

      const selectedModel = KONTEXT_MODELS.find(m => m.id === modelId);

      // Resize image based on target resolution
      let maxDim = 1024;
      if (resolutionVal === "2K") maxDim = 2048;
      if (resolutionVal === "4K") maxDim = 4096;

      const base64Image = await resizeImage(image, maxDim);

      let generatedFile: File | null = null;

      if (selectedModel?.provider === "gemini") {
        // Gemini Flow
        
        // For Gemini 2.5 Flash Image (Nano Banana), we expect it to return the image natively 
        // or as a base64 string in the response if we ask correctly, but typically 'generateContent' 
        // for image models returns 'inline_data' in the parts if configured for media output, 
        // OR we can use the JSON prompt as a fallback.
        // However, since the user said "it's supposed to use gemini 2.5", we assume standard image gen behavior.

        let finalPrompt = promptText;
        if (shouldIsolate) finalPrompt += " (isolate subject)";

        // We don't enforce JSON here because the native model might return media parts directly.
        // But we should handle both cases (text with base64 or native parts).

        const result = await generateGemini(finalPrompt, base64Image, modelId, resolutionVal);
        
        // Check for native inline_data in parts (handle both snake_case and camelCase)
        let imageB64: string | null = null;
        let responseText = "";

        // Log the structure to console to debug on client side too
        console.log("Gemini Response Structure:", JSON.stringify(result, null, 2));

        if (result.candidates && result.candidates[0]?.content?.parts) {
           // Loop through all parts to find an image, ignoring text if we find one
           for (const part of result.candidates[0].content.parts) {
             // Check snake_case
             if (part.inline_data && part.inline_data.mime_type?.startsWith("image/")) {
               imageB64 = part.inline_data.data;
               break; // Found image, stop looking
             }
             // Check camelCase
             if (part.inlineData && part.inlineData.mimeType?.startsWith("image/")) {
               imageB64 = part.inlineData.data;
               break; // Found image, stop looking
             }
           }
        }

        // Fallback: Check for text containing JSON (old behavior)
        if (!imageB64) {
           if (result.candidates && result.candidates[0]?.content?.parts) {
             responseText = result.candidates[0].content.parts
               .filter((p: any) => p.text)
               .map((p: any) => p.text)
               .join(" ") || "";
           } else if (typeof result === 'string') {
             responseText = result;
           }

           // Try to find base64 in text
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
          generatedFile = new File([blob], `gemini_${genId}.png`, { type: "image/png" });
          
          const imageUrl = URL.createObjectURL(generatedFile);
          
          updateGeneration(activeSession.id, genId, { 
            status: "completed", 
            imageUrl, 
            file: generatedFile 
          });
        } else {
          console.error("Gemini Response:", result);
          // Use responseText as error message if available (e.g. "I cannot generate images of...")
          throw new Error(responseText || "No image found in Gemini response");
        }

      } else {
        // Replicate Flow
        // Convert base64 back to blob for upload
        const res = await fetch(base64Image);
        const blob = await res.blob();
        const resizedFile = new File([blob], "resized_input.jpg", { type: "image/jpeg" });
        
        const imageUrlInput = await uploadToReplicate(resizedFile);
        
        let finalPrompt = promptText;
        if (shouldIsolate) finalPrompt += " please leave the rest of the image untouched.";

        let replicateModelId = "black-forest-labs/flux-kontext-dev";
        let input: any = {
          prompt: finalPrompt,
          input_image: imageUrlInput,
          aspect_ratio: "match_input_image",
          output_format: "png",
          disable_safety_checker: true
        };

        if (modelId === "flux-kontext-pro") {
          replicateModelId = "black-forest-labs/flux-kontext-pro";
        } else if (modelId === "flux-kontext-max") {
          replicateModelId = "black-forest-labs/flux-kontext-max";
        } else if (modelId === "qwen-image-edit") {
          replicateModelId = "qwen/qwen-image-edit";
          input = {
            image: imageUrlInput,
            prompt: finalPrompt,
            output_quality: 80,
            disable_safety_checker: true
          };
        } else if (modelId === "seedream-4") {
          replicateModelId = "bytedance/seedream-4";
          input = {
            image_input: [imageUrlInput],
            prompt: finalPrompt,
            aspect_ratio: "4:3",
            disable_safety_checker: true
          };
        }

        const prediction = await predictReplicate(replicateModelId, input);
        let result = prediction;
        
        while (result.status !== "succeeded" && result.status !== "failed" && result.status !== "canceled") {
          await new Promise(r => setTimeout(r, 1000));
          result = await pollPrediction(result.id);
        }

        if (result.status === "succeeded") {
          const outputUrl = Array.isArray(result.output) ? result.output[0] : result.output;
          
          const res = await fetch(outputUrl);
          const blob = await res.blob();
          generatedFile = new File([blob], `generated_${genId}.png`, { type: "image/png" });
          const localUrl = URL.createObjectURL(generatedFile);
          
          updateGeneration(activeSession.id, genId, { 
            status: "completed", 
            imageUrl: localUrl, 
            file: generatedFile 
          });
        } else {
          throw new Error(result.error || "Generation failed");
        }
      }

      // Auto-save to Google Photos if successful
      if (generatedFile) {
        const description = `Generated by Flux Web\nPrompt: ${promptText}\nModel: ${modelId}`;
        uploadToGooglePhotos(generatedFile, description)
          .then(() => console.log("Auto-saved generation to Google Photos"))
          .catch(err => {
            // Ignore "not connected" errors to avoid noise
            if (err.message !== "Google Photos not connected") {
              console.error("Failed to auto-save to Google Photos:", err);
            }
          });
      }

    } catch (e: any) {
      console.error(e);
      updateGeneration(activeSession!.id, genId, { 
        status: "failed", 
        error: e.message 
      });
    }
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Top Section: Thumbnail + Controls */}
      <div className="flex flex-col md:flex-row gap-4 items-start bg-black/5 p-4 rounded-lg">
        {/* Thumbnail */}
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
          onRetry={(gen) => generateImage(gen.id, gen.prompt || "", gen.model || "", false, resolution)}
        />
      </div>
    </div>
  );
}
