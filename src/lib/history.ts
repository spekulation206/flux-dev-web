import { db } from "./firestore";

export async function savePrompt(section: string, prompt: string) {
  if (!prompt) return;

  const docRef = db.collection("prompt_history").doc(section);
  
  try {
    await db.runTransaction(async (t) => {
      const doc = await t.get(docRef);
      let prompts: string[] = [];
      
      if (doc.exists) {
        prompts = doc.data()?.prompts || [];
      }

      // Remove duplicate if exists (to move to top)
      prompts = prompts.filter(p => p !== prompt);
      
      // Add to front
      prompts.unshift(prompt);
      
      // Limit to 200
      if (prompts.length > 200) {
        prompts = prompts.slice(0, 200);
      }

      t.set(docRef, { prompts }, { merge: true });
    });
  } catch (error) {
    console.error("Error saving prompt:", error);
  }
}

export async function getPrompts(section: string): Promise<string[]> {
  try {
    const doc = await db.collection("prompt_history").doc(section).get();
    if (!doc.exists) return [];
    return doc.data()?.prompts || [];
  } catch (error) {
    console.error("Error fetching prompts:", error);
    return [];
  }
}

