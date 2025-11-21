"use client";

import { useTheme } from "./ThemeProvider";
import { Moon, Sun, Image as ImageIcon } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocalStorage } from "@/lib/hooks";

import { CostDisplay } from "./CostDisplay";

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const [googleConnected, setGoogleConnected] = useState(false);
  const [autoUpload, setAutoUpload] = useLocalStorage("autoUploadToGoogle", false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Check server-side status
    fetch("/api/auth/google/status")
      .then(res => res.json())
      .then(data => {
        if (data.connected) {
          setGoogleConnected(true);
          // Always enable auto-upload if connected
          setAutoUpload(true);
        }
      })
      .catch(console.error);

    // Check query param for immediate feedback after redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get("google_connected") === "true") {
      setGoogleConnected(true);
      setAutoUpload(true);
      window.history.replaceState({}, "", "/");
    }
  }, []);

  const handleGoogleConnect = () => {
    window.location.href = "/api/auth/google/signin";
  };

  return (
    <header className="w-full py-4 px-6 flex justify-between items-center border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="flex items-center gap-4">
        <CostDisplay />
        <h1 className="text-xl font-bold tracking-tight uppercase">Flux Web</h1>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {mounted && (
            <div className="flex items-center gap-2">
              {googleConnected ? (
                <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                  ✓ Auto-uploading to Google Photos
                </span>
              ) : (
                 <button 
                   onClick={handleGoogleConnect}
                   className="text-xs underline opacity-70 hover:opacity-100 whitespace-nowrap p-2"
                 >
                   Connect Google Photos
                 </button>
              )}
            </div>
          )}
        </div>

        <button
          onClick={toggleTheme}
          className="p-2 rounded-sm hover:bg-foreground/10 transition-colors"
          aria-label="Toggle Dark Mode"
        >
          {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
        </button>
      </div>
    </header>
  );
}
