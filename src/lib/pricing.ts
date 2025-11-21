export const PRICING = {
  replicate: {
    // Legacy time-based pricing (for non-Kontext models)
    "black-forest-labs/flux-1-dev": {
      pricePerSecond: 0.001528, // H100 pricing
    },
    "black-forest-labs/flux-1-schnell": {
       pricePerSecond: 0.000575, // A40 pricing (often used for schnell)
    },
    // Kontext models - per-image pricing
    "black-forest-labs/flux-kontext-dev": {
      pricePerImage: 0.00025, // $0.00025 per image (0.025 cents)
    },
    "black-forest-labs/flux-kontext-pro": {
      pricePerImage: 0.0004, // $0.0004 per image (0.04 cents)
    },
    "black-forest-labs/flux-kontext-max": {
      pricePerImage: 0.0008, // $0.0008 per image (0.08 cents)
    },
    "qwen/qwen-image-edit": {
      pricePerImage: 0.03, // $0.03 per image
    },
    "bytedance/seedream-4": {
      pricePerImage: 0.03, // $0.03 per image
    },
    // Fallback
    default: {
      pricePerSecond: 0.000575, // A40 pricing as safe default
    },
  },
  gemini: {
    // Legacy token-based pricing (for non-image models)
    "gemini-1.5-flash": {
      inputPricePerMillionTokens: 0.075,
      outputPricePerMillionTokens: 0.30,
    },
    "gemini-1.5-pro": {
      inputPricePerMillionTokens: 3.50,
      outputPricePerMillionTokens: 10.50,
    },
    // Kontext models - per-image pricing
    "gemini-2.5-flash-image": {
      pricePerImage: 0.039, // $0.039 per image (Nano Banana)
    },
    "gemini-3-pro-image-preview": {
      // Resolution-based pricing (Nano Banana Pro)
      pricePerImage1080p: 0.139, // $0.139 for 1080p/1K
      pricePerImage2K: 0.139, // $0.139 for 2K
      pricePerImage4K: 0.24, // $0.24 for 4K
    },
  },
};

export function calculateReplicateCost(
  model: string, 
  durationSeconds?: number,
  isPerImage: boolean = false
): number {
  const modelKey = Object.keys(PRICING.replicate).find((k) => model.includes(k));
  const pricing = modelKey
    ? PRICING.replicate[modelKey as keyof typeof PRICING.replicate]
    : PRICING.replicate.default;

  // Check if this model uses per-image pricing
  if (isPerImage && "pricePerImage" in pricing) {
    return pricing.pricePerImage as number;
  }

  // Fall back to time-based pricing for legacy models
  if ("pricePerSecond" in pricing && durationSeconds !== undefined) {
    return durationSeconds * (pricing.pricePerSecond as number);
  }

  // If per-image pricing is requested but not available, return 0
  if (isPerImage) {
    return 0;
  }

  // Default fallback
  return durationSeconds ? durationSeconds * 0.000575 : 0;
}

export function calculateGeminiCost(
  model: string,
  inputTokens?: number,
  outputTokens?: number,
  resolution?: string
): number {
  const modelKey = Object.keys(PRICING.gemini).find((k) => model.includes(k));
  const pricing = modelKey
    ? PRICING.gemini[modelKey as keyof typeof PRICING.gemini]
    : PRICING.gemini["gemini-1.5-flash"];

  // Handle Nano Banana Pro with resolution-based pricing
  if (model === "gemini-3-pro-image-preview" || modelKey === "gemini-3-pro-image-preview") {
    if (resolution === "4K") {
      return pricing.pricePerImage4K as number;
    } else if (resolution === "2K") {
      return pricing.pricePerImage2K as number;
    } else {
      // Default to 1080p/1K pricing
      return pricing.pricePerImage1080p as number;
    }
  }

  // Handle Nano Banana (per-image pricing)
  if (model === "gemini-2.5-flash-image" || modelKey === "gemini-2.5-flash-image") {
    return pricing.pricePerImage as number;
  }

  // Fall back to token-based pricing for legacy models
  if ("inputPricePerMillionTokens" in pricing && inputTokens !== undefined && outputTokens !== undefined) {
    const inputCost = (inputTokens / 1_000_000) * (pricing.inputPricePerMillionTokens as number);
    const outputCost = (outputTokens / 1_000_000) * (pricing.outputPricePerMillionTokens as number);
    return inputCost + outputCost;
  }

  return 0;
}
