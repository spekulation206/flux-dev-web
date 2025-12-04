"use client";

import React, { useState, useRef } from "react";
import { Loader2, Video, Download, RefreshCw } from "lucide-react";
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
  
  // Store last prediction ID for recovery
  const lastPredictionIdRef = useRef<string | null>(null);

  const handleDownload = async () => {
    if (!videoUrl) return;
    try {
      setStatus("Downloading...");
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `generated-video-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setStatus("");
    } catch (error) {
      console.error("Download failed:", error);
      // Fallback to opening in new tab
      window.open(videoUrl, "_blank");
      setStatus("Download failed - opened in new tab");
    }
  };

  const uploadVideoToGooglePhotos = async (url: string, prompt: string) => {
    try {
      setStatus("Uploading to Google Photos...");
      // Fetch the video blob
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], `generated-video-${Date.now()}.mp4`, { type: 'video/mp4' });

      const formData = new FormData();
      formData.append("file", file);
      formData.append("description", `Generated video from prompt: ${prompt}`);

      const uploadRes = await fetch("/api/google-photos/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error("Failed to upload to Google Photos");
      }

      setStatus("Saved to Google Photos!");
    } catch (error) {
      console.error("Upload error:", error);
      setStatus("Video generated, but Google Photos upload failed.");
    }
  };

  const pollAndFinalize = async (id: string, promptText: string) => {
      let result = await pollPrediction(id);
      while (result.status !== "succeeded" && result.status !== "failed" && result.status !== "canceled") {
        await new Promise(r => setTimeout(r, 2000));
        result = await pollPrediction(result.id);
        setStatus(`Generating... ${result.status}`);
      }

      if (result.status === "succeeded") {
        const outputUrl = result.output;
        const url = Array.isArray(outputUrl) ? outputUrl[0] : outputUrl;
        setVideoUrl(url);
        
        // Auto-upload to Google Photos
        await uploadVideoToGooglePhotos(url, promptText);
      } else {
        throw new Error(result.error || "Video generation failed");
      }
  };

  const handleGenerate = async (promptText: string) => {
    if (!promptText) {
      alert("Please enter a prompt");
      return;
    }
    setIsProcessing(true);
    setStatus("Uploading image...");
    setVideoUrl(null);
    lastPredictionIdRef.current = null;

    try {
      const imageUrl = await uploadToReplicate(image);
      
      setStatus("Starting generation...");
      
      let modelId = "wan-video/wan-2.2-i2v-fast";
      let input: any = {
        image: imageUrl,
        prompt: promptText,
        disable_safety_checker: true
      };

      // Model selection logic
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
      lastPredictionIdRef.current = prediction.id;
      
      await pollAndFinalize(prediction.id, promptText);

    } catch (e: any) {
      console.error(e);
      setStatus(`Error: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRecover = async () => {
    if (!lastPredictionIdRef.current) return;
    
    setIsProcessing(true);
    setStatus("Attempting recovery...");
    
    try {
      await pollAndFinalize(lastPredictionIdRef.current, "Recovered video");
    } catch (e: any) {
      console.error(e);
      setStatus(`Recovery failed: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex-1 flex items-center justify-center bg-black/5 rounded-md p-4 relative group">
        {videoUrl ? (
          <div className="relative w-full h-full flex flex-col items-center justify-center">
             <video src={videoUrl} controls className="max-h-[400px] w-full object-contain" />
             <button 
                onClick={handleDownload}
                className="absolute top-2 right-2 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
                title="Download Video"
             >
               <Download size={20} />
             </button>
          </div>
        ) : (
          <div className="relative w-full h-full flex flex-col items-center justify-center">
            <img
              src={URL.createObjectURL(image)}
              alt="Preview"
              className="max-h-[400px] object-contain opacity-50"
            />
            {isProcessing && (
               <div className="absolute inset-0 flex items-center justify-center">
                 <Loader2 className="animate-spin text-foreground" size={48} />
               </div>
            )}
            {!isProcessing && status.startsWith("Error") && lastPredictionIdRef.current && (
              <button 
                onClick={handleRecover}
                className="absolute inset-0 flex flex-col items-center justify-center bg-black/10 hover:bg-black/20 transition-colors gap-2"
              >
                <RefreshCw size={32} className="text-foreground" />
                <span className="bg-background/80 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
                  Recover Last Generation
                </span>
              </button>
            )}
          </div>
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
        {status && <p className="text-xs text-foreground/70 truncate">{status}</p>}
      </div>
    </div>
  );
}