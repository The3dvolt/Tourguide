export async function POST(req: Request) {
  try {
    const { pois, locationContext, model, customKey } = await req.json();

    // Priority: 1. User's Key -> 2. Developer's Key
    const activeKey = customKey || process.env.GEMINI_API_KEY;

    if (!activeKey) {
      return NextResponse.json({ text: "No API Key provided." }, { status: 401 });
    }

    const genAI = new GoogleGenerativeAI(activeKey);
    // Use the model selected by the user in the UI
    const genModel = genAI.getGenerativeModel({ model: model || "gemini-1.5-flash" });

    const prompt = `Historian guide...`; // (Keep your existing prompt)
    const result = await genModel.generateContent(prompt);
    
    return NextResponse.json({ text: result.response.text() });
  } catch (error: any) {
    return NextResponse.json({ text: "Error", details: error.message }, { status: 500 });
  }
}