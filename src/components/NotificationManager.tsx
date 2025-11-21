"use client";

import React, { useEffect, useRef } from "react";
import { useSession } from "@/context/SessionContext";
import { CheckCircle, AlertCircle } from "lucide-react";
import { clsx } from "clsx";

export function NotificationManager() {
  const { sessions, activeSessionId } = useSession();
  const prevStatuses = useRef<Record<string, string>>({});
  const [notifications, setNotifications] = React.useState<{id: string, message: string, type: 'success' | 'error'}[]>([]);

  useEffect(() => {
    sessions.forEach(session => {
      const prevStatus = prevStatuses.current[session.id];
      
      // If status changed to completed and it wasn't completed before
      if (session.status === "completed" && prevStatus === "processing") {
        // Show notification
        if (session.id !== activeSessionId) {
           addNotification(`Image ready!`, 'success');
        }
      }
      
       // If status changed to error
      if (session.status === "error" && prevStatus === "processing") {
         addNotification(`Processing failed for an image`, 'error');
      }

      prevStatuses.current[session.id] = session.status;
    });
  }, [sessions, activeSessionId]);

  const addNotification = (message: string, type: 'success' | 'error') => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
  };

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {notifications.map(n => (
        <div 
          key={n.id} 
          className={clsx(
            "flex items-center gap-2 px-4 py-3 rounded-md shadow-lg transition-all transform translate-y-0 opacity-100 pointer-events-auto",
             n.type === 'success' ? "bg-foreground text-background" : "bg-red-500 text-white"
          )}
        >
          {n.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span className="text-sm font-medium">{n.message}</span>
        </div>
      ))}
    </div>
  );
}

