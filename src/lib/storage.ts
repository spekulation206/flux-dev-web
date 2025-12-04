import { openDB, DBSchema } from 'idb';
import { Session, Generation } from '@/context/SessionContext';

interface FluxDB extends DBSchema {
  sessions: {
    key: string;
    value: Session;
  };
  meta: {
    key: string;
    value: string | null;
  };
}

const DB_NAME = 'flux_web_db';
const STORE_NAME = 'sessions';
const EXPIRY_MS = 27 * 60 * 60 * 1000; // 27 hours

async function getDB() {
  return openDB<FluxDB>(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      db.createObjectStore('meta');
    },
  });
}

export async function saveSessionsToStorage(sessions: Session[], activeSessionId: string | null) {
  try {
    const db = await getDB();
    const tx = db.transaction([STORE_NAME, 'meta'], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    // 1. Get all existing keys to identify deletions
    const storedKeys = await store.getAllKeys();
    const currentSessionIds = new Set(sessions.map(s => s.id));
    
    // 2. Delete removed sessions
    for (const key of storedKeys) {
      if (!currentSessionIds.has(key as string)) {
        await store.delete(key);
      }
    }

    // 3. Save/Update current sessions
    // Using put() will overwrite existing entries with the same key (upsert)
    for (const session of sessions) {
      await store.put(session);
    }

    // 4. Save active ID
    await tx.objectStore('meta').put(activeSessionId, 'activeSessionId');

    await tx.done;
  } catch (error) {
    console.error('Failed to save sessions to storage:', error);
  }
}

export async function loadSessionsFromStorage(): Promise<{ sessions: Session[]; activeId: string | null }> {
  try {
    const db = await getDB();
    const now = Date.now();
    
    // 1. Get all sessions
    const allSessions = await db.getAll(STORE_NAME);
    const activeId = await db.get('meta', 'activeSessionId') || null;

    // 2. Filter and Revive
    const validSessions: Session[] = [];
    const deletePromises: Promise<void>[] = [];

    for (const session of allSessions) {
      // Check 27 hour expiry
      if (now - session.createdAt > EXPIRY_MS) {
        deletePromises.push(db.delete(STORE_NAME, session.id));
        continue;
      }

      // REGENERATE URLs: Blob URLs (blob:...) expire on reload.
      // We must create new ones from the stored File objects.
      const revivedSession = { ...session };

      // Ensure we have a valid currentImage to generate thumbnail from
      if ((revivedSession.currentImage as any) instanceof File || (revivedSession.currentImage as any) instanceof Blob) {
        revivedSession.thumbnailUrl = URL.createObjectURL(revivedSession.currentImage);
      } else if ((revivedSession.originalImage as any) instanceof File || (revivedSession.originalImage as any) instanceof Blob) {
        // Fallback to original if current is somehow missing/invalid
        revivedSession.thumbnailUrl = URL.createObjectURL(revivedSession.originalImage);
      }
      
      // Revive generation URLs if they were blobs
      revivedSession.generations = revivedSession.generations.map(gen => {
         // If we stored a file for the generation, ensure its URL is valid
         if (gen.file && ((gen.file as any) instanceof File || (gen.file as any) instanceof Blob)) {
           return { ...gen, imageUrl: URL.createObjectURL(gen.file) };
         }
         return gen;
      });

      validSessions.push(revivedSession);
    }

    // Clean up expired sessions in background
    if (deletePromises.length > 0) {
      Promise.all(deletePromises).catch(err => console.error('Error cleaning up expired sessions:', err));
    }

    // Sort by newest first
    validSessions.sort((a, b) => b.createdAt - a.createdAt);

    return { sessions: validSessions, activeId };
  } catch (error) {
    console.error('Failed to load sessions from storage:', error);
    return { sessions: [], activeId: null };
  }
}
