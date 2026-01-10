export async function POST(req: Request) {
  try {
    const { pois, locationContext, model, customKey } = await req.json();

    // 1. Determine which key to use
    const activeKey = customKey || process.env.GEMINI_API_KEY;
    if (!activeKey) {
      return NextResponse.json({ details: "No API Key found." }, { status: 401 });
    }

    const genAI = new GoogleGenerativeAI(activeKey);
    
    // 2. Determine which model to use (Fallback to 1.5-flash)
    const modelName = model || "gemini-1.5-flash";
    const genModel = genAI.getGenerativeModel({ model: modelName });

    // 3. Build the prompt safely
    const landmarkString = pois && pois.length > 0 
      ? pois.map((p: any) => p.name).join(", ") 
      : "the general architecture of this street";

    const prompt = `You are a local historian. Tell a 2-sentence story about ${landmarkString} near ${locationContext?.street || 'this area'}.`;

    const result = await genModel.generateContent(prompt);
    const response = await result.response;
    
    return NextResponse.json({ text: response.text() });
  } catch (error: any) {
    return NextResponse.json({ 
      text: "Error", 
      details: error.message 
    }, { status: 500 });
  }
}