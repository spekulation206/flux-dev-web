import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load environment variables
dotenv.config({ path: ".env" });

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

function log(message: string, type: "info" | "success" | "error" | "warning" = "info") {
  switch (type) {
    case "success":
      console.log(`${GREEN}✔ ${message}${RESET}`);
      break;
    case "error":
      console.log(`${RED}✖ ${message}${RESET}`);
      break;
    case "warning":
      console.log(`${YELLOW}⚠ ${message}${RESET}`);
      break;
    default:
      console.log(`ℹ ${message}`);
  }
}

async function verifyReplicate() {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    log("REPLICATE_API_TOKEN is missing", "error");
    return false;
  }

  try {
    const res = await fetch("https://api.replicate.com/v1/account", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      log("REPLICATE_API_TOKEN is invalid (401 Unauthorized)", "error");
      return false;
    } else if (!res.ok) {
      // Account endpoint might not be available for all token types, try models
      const res2 = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-fill-dev", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res2.ok) {
         log(`Replicate API check failed: ${res2.status} ${res2.statusText}`, "error");
         return false;
      }
    }
    
    log("Replicate API connection successful", "success");
    return true;
  } catch (e: any) {
    log(`Replicate connection error: ${e.message}`, "error");
    return false;
  }
}

async function verifyGemini() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    log("GEMINI_API_KEY is missing", "error");
    return false;
  }

  try {
    // List models to verify key
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    
    if (!res.ok) {
      const text = await res.text();
      log(`Gemini API check failed: ${res.status} ${text}`, "error");
      return false;
    }

    log("Gemini API connection successful", "success");
    return true;
  } catch (e: any) {
    log(`Gemini connection error: ${e.message}`, "error");
    return false;
  }
}

function verifyGoogleAuth() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  let valid = true;

  if (!clientId) {
    log("GOOGLE_CLIENT_ID is missing (Required for Google Photos)", "warning");
    valid = false;
  }
  if (!clientSecret) {
    log("GOOGLE_CLIENT_SECRET is missing (Required for Google Photos)", "warning");
    valid = false;
  }
  if (!appUrl) {
    log("NEXT_PUBLIC_APP_URL is missing", "warning");
    valid = false;
  }

  if (valid) {
    log("Google OAuth configuration present", "success");
  }
  return valid;
}

function verifyFiles() {
  const requiredFiles = [
    "src/app/page.tsx",
    "src/components/MainApp.tsx",
    "src/components/tools/CropMaskTool.tsx",
    "src/components/tools/KontextTool.tsx",
    "src/components/tools/UpscaleTool.tsx",
    "src/components/tools/VideoTool.tsx",
    "src/lib/api.ts",
    "src/lib/googlePhotos.ts",
    "server_setup_info.txt",
    ".env"
  ];

  let allExist = true;
  for (const file of requiredFiles) {
    if (!fs.existsSync(path.resolve(process.cwd(), file))) {
      log(`Missing file: ${file}`, "error");
      allExist = false;
    }
  }

  if (allExist) {
    log("Critical project files present", "success");
  }
  return allExist;
}

async function main() {
  console.log("🚀 Starting Flux Web App Verification...\n");

  const envOk = fs.existsSync(".env");
  if (!envOk) {
    log(".env file not found!", "error");
    console.log("\nPlease create a .env file with your API keys.");
    process.exit(1);
  } else {
    log(".env file found", "success");
  }

  const filesOk = verifyFiles();
  const replicateOk = await verifyReplicate();
  const geminiOk = await verifyGemini();
  const googleOk = verifyGoogleAuth();

  console.log("\n--- Summary ---");
  
  if (filesOk && replicateOk && geminiOk) {
    console.log(`${GREEN}✅ Core systems are operational.${RESET}`);
    if (!googleOk) {
      console.log(`${YELLOW}⚠ Google Photos integration is not fully configured.${RESET}`);
    }
    console.log("\nYou can now run the app with:");
    console.log(`${GREEN}npm run dev${RESET}`);
  } else {
    console.log(`${RED}❌ Verification failed. Please fix the errors above.${RESET}`);
    process.exit(1);
  }
}

main();

