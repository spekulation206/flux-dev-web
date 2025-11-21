"use client";

import React from "react";
import { Plus, Loader2, AlertCircle, Image as ImageIcon } from "lucide-react";
import { useSession, Session } from "@/context/SessionContext";
import { ImageUploader } from "./ImageUploader";
import { clsx } from "clsx";

export function Gallery() {
  const { sessions, setActiveSessionId, addSession } = useSession();

  const handleImageSelect = (file: File) => {
    addSession(file);
  };

  if (sessions.length === 0) {
    return (
      <div className="w-full max-w-xl mt-20 flex flex-col gap-4">
        <h2 className="text-2xl font-semibold text-center">Start Editing</h2>
        <ImageUploader onImageSelect={handleImageSelect} />
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6 pb-20">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {sessions.map((session) => (
          <SessionCard 
            key={session.id} 
            session={session} 
            onClick={() => setActiveSessionId(session.id)} 
          />
        ))}
        
        {/* Add New Button Card */}
        <label className="cursor-pointer flex flex-col items-center justify-center aspect-square border-2 border-dashed border-foreground/20 hover:border-foreground/50 rounded-lg bg-black/5 hover:bg-black/10 transition-colors">
          <Plus size={32} className="text-foreground/50" />
          <span className="text-sm text-foreground/50 font-medium mt-2">New Image</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) {
                handleImageSelect(e.target.files[0]);
              }
            }}
          />
        </label>
      </div>
    </div>
  );
}

function SessionCard({ session, onClick }: { session: Session; onClick: () => void }) {
  return (
    <div 
      onClick={onClick}
      className="relative group cursor-pointer rounded-lg overflow-hidden border border-border bg-background aspect-square"
    >
      <img 
        src={session.thumbnailUrl} 
        alt="Session thumbnail" 
        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
      />
      
      {/* Status Overlay */}
      <div className={clsx(
        "absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity",
        session.status === "idle" ? "opacity-0 group-hover:opacity-100" : "opacity-100"
      )}>
        {session.status === "processing" && (
          <div className="flex flex-col items-center text-white">
            <Loader2 size={24} className="animate-spin mb-1" />
            <span className="text-xs font-medium">Processing</span>
          </div>
        )}
        {session.status === "error" && (
          <div className="flex flex-col items-center text-red-200">
            <AlertCircle size={24} className="mb-1" />
            <span className="text-xs font-medium">Error</span>
          </div>
        )}
        {session.status === "completed" && ( // unexpected: usually goes back to idle after completed, but if we want to show success state
             <div className="opacity-0 group-hover:opacity-100 text-white font-medium text-sm">
                Open
             </div>
        )}
        {session.status === "idle" && (
             <div className="text-white font-medium text-sm">
                Open
             </div>
        )}
      </div>
      
      {/* Time or Info Badge (Optional) */}
      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
         {/* Can put timestamp here */}
      </div>
    </div>
  );
}

