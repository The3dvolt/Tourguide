// api/gemini-live.js
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { lat, lng, userQuery } = req.body;

  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash-exp", // Using 2.0 for best speed
      tools: [{ googleSearchRetrieval: {} }] // For historical grounding
    });

    const chat = model.startChat({
      systemInstruction: "You are an expressive local historian. Use a warm, natural tone. Ask the user if they can see specific landmarks nearby. Keep responses to 2-3 sentences max to keep it conversational.",
    });

    // Provide the location context in the prompt
    const prompt = `I am at coordinates ${lat}, ${lng}. ${userQuery || "Tell me something interesting about where I am."}`;

    // Use streaming to get parts of the response as they are generated
    const result = await chat.sendMessageStream(prompt);

    // Set headers for SSE (Server-Sent Events) to stream to the phone
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      // Send the text to the frontend
      res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
    }

    res.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to connect to Gemini" });
  }
}