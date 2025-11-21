"use client";

import React, { useState } from "react";
import { Loader2, Video } from "lucide-react";
import { uploadToReplicate, predictReplicate, pollPrediction } from "@/lib/api";
import { ModelSelector, ModelOption } from "../ModelSelector";
import { PromptInput } from "../PromptInput";

interface VideoToolProps {
  image: File;
}

const VIDEO_MODELS: ModelOption[] = [
  { id: "wan-2.2-i2v-fast", label: "Wan 2.2 I2V Fast" },
  { id: "wan-2.2-5b-fast", label: "Wan 2.2 5B Fast" },
  { id: "seedance-1-pro-fast-2s", label: "Seedance Pro Fast (2s)" },
  { id: "seedance-1-pro-fast-5s", label: "Seedance Pro Fast (5s)" },
  { id: "hailuo-1.5", label: "Hailuo 1.5" },
];

export function VideoTool({ image }: VideoToolProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [model, setModel] = useState("wan-2.2-i2v-fast");

  const handleGenerate = async (promptText: string) => {
    if (!promptText) {
      alert("Please enter a prompt");
      return;
    }
    setIsProcessing(true);
    setStatus("Uploading image...");
    setVideoUrl(null);

    try {
      const imageUrl = await uploadToReplicate(image);
      
      setStatus("Generating video...");
      
      let modelId = "wan-video/wan-2.2-i2v-fast";
      let input: any = {
        image: imageUrl,
        prompt: promptText,
        disable_safety_checker: true
      };

      if (model === "wan-2.2-5b-fast") {
        modelId = "wan-video/wan-2.2-5b-fast";
        input = {
            image: imageUrl,
            prompt: promptText,
            sample_shift: 12,
            disable_safety_checker: true
        };
      } else if (model === "seedance-1-pro-fast-2s") {
        modelId = "bytedance/seedance-1-pro-fast";
        input = {
            prompt: promptText,
            image: imageUrl,
            resolution: "480p",
            duration: 2
        };
      } else if (model === "seedance-1-pro-fast-5s") {
        modelId = "bytedance/seedance-1-pro-fast";
        input = {
            prompt: promptText,
            image: imageUrl,
            resolution: "480p",
            duration_in_seconds: 5
        };
      } else if (model === "hailuo-1.5") {
        modelId = "hailuoai/hailuo-1.5";
        input = {
            prompt: promptText,
            duration: 6,
            resolution: "768p",
            prompt_optimizer: true,
            first_frame_image: imageUrl
        };
      }

      const prediction = await predictReplicate(modelId, input);

      let result = prediction;
      while (result.status !== "succeeded" && result.status !== "failed" && result.status !== "canceled") {
        await new Promise(r => setTimeout(r, 2000));
        result = await pollPrediction(result.id);
        setStatus(`Generating... ${result.status}`);
      }

      if (result.status === "succeeded") {
        const outputUrl = result.output;
        const url = Array.isArray(outputUrl) ? outputUrl[0] : outputUrl;
        setVideoUrl(url);
        setStatus("Done!");
      } else {
        throw new Error(result.error || "Video generation failed");
      }
    } catch (e: any) {
      console.error(e);
      alert(e.message);
      setStatus("Error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex-1 flex items-center justify-center bg-black/5 rounded-md p-4">
        {videoUrl ? (
          <video src={videoUrl} controls className="max-h-[400px]" />
        ) : (
          <img
            src={URL.createObjectURL(image)}
            alt="Preview"
            className="max-h-[400px] object-contain"
          />
        )}
      </div>
      
      <div className="flex flex-col gap-4">
        <div className="flex gap-4 items-center">
          <ModelSelector 
            models={VIDEO_MODELS} 
            selectedModelId={model} 
            onSelect={setModel} 
            className="w-48"
          />
        </div>

        <PromptInput
          onSubmit={handleGenerate}
          placeholder="Describe the video..."
          buttonLabel="Generate"
          buttonIcon={<Video size={16} />}
          isProcessing={isProcessing}
          section="video"
        />
        {status && <p className="text-xs text-foreground/70">{status}</p>}
      </div>
    </div>
  );
}
