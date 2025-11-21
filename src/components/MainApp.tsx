"use client";

import React from "react";
import { useSession } from "@/context/SessionContext";
import { Editor } from "./Editor";
import { Gallery } from "./Gallery";
import { ArrowLeft } from "lucide-react";

export function MainApp() {
  const { activeSession, setActiveSessionId, updateSessionImage, updateSessionStatus } = useSession();

  // If we have an active session, show the Editor.
  // Otherwise, show the Gallery.

  if (activeSession) {
    return (
      <div className="w-full max-w-6xl mx-auto p-4 flex flex-col gap-4 flex-1">
        {/* Mobile Header / Back Button */}
        <div className="flex items-center gap-4 mb-2">
          <button 
            onClick={() => setActiveSessionId(null)}
            className="flex items-center gap-2 text-sm font-medium text-foreground/70 hover:text-foreground transition-colors"
          >
            <ArrowLeft size={20} />
            Back to Gallery
          </button>
        </div>

        <Editor 
          key={activeSession.id} // Force re-mount if switching sessions directly (though we go back to gallery first usually)
          image={activeSession.currentImage}
          onReset={() => setActiveSessionId(null)} // This effectively closes the editor
          onUpdateImage={(file, metadata) => updateSessionImage(activeSession.id, file, metadata)}
          onUpdateStatus={(status, msg) => updateSessionStatus(activeSession.id, status, msg)}
        />
      </div>
    );
  }

  return (
    <main className="flex flex-col items-center w-full max-w-6xl mx-auto p-4 gap-8 flex-1">
      <Gallery />
    </main>
  );
}
