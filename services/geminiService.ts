import { GoogleGenAI } from "@google/genai";
import { Resolution } from "../types";

// Helper to get client with current key
const getAiClient = () => {
  // Always instantiate a new client to pick up the latest selected key if changed
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const generateVelumVideo = async (
  prompt: string,
  imageFile: File | null
): Promise<string> => {
  const ai = getAiClient();
  const model = 'veo-3.1-fast-generate-preview';

  let operation;

  if (imageFile) {
    const base64Data = await fileToBase64(imageFile);
    // Remove header if present for inlineData, though @google/genai usually handles types
    // Using imageBytes property for Veo specific call
    const cleanBase64 = base64Data.split(',')[1];
    
    operation = await ai.models.generateVideos({
      model,
      prompt: prompt || "Enhance this aesthetic",
      image: {
        imageBytes: cleanBase64,
        mimeType: imageFile.type,
      },
      config: {
        numberOfVideos: 1,
        resolution: '720p', // Fast generate supports 720p
        aspectRatio: '16:9',
      }
    });
  } else {
    // Text only
    operation = await ai.models.generateVideos({
        model,
        prompt: prompt,
        config: {
            numberOfVideos: 1,
            resolution: '720p',
            aspectRatio: '16:9'
        }
    });
  }

  // Polling
  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) throw new Error("No video generated");

  // Fetch with key to get displayable URL
  // In a real app, you might proxy this or use the signed URL directly if CORS allows.
  // For this demo, we assume the URI + Key works for a download/src link.
  return `${videoUri}&key=${process.env.API_KEY}`;
};

export const generateVelumImage = async (
  prompt: string,
  resolution: Resolution
): Promise<string> => {
  const ai = getAiClient();
  const model = 'gemini-3-pro-image-preview';

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [{ text: prompt }]
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1",
        imageSize: resolution // 1K, 2K, 4K
      }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }

  throw new Error("No image generated");
};

// Utils
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};