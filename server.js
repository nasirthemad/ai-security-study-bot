import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const systemMessage = {
  role: "system",
  content: `You are a high-level CompTIA Security+ SY0-701 study assistant.

Rules:
- Follow Learn, Quiz, Test, Example, and Flashcards modes exactly
- In Quiz mode, generate exactly 1 multiple-choice question
- In Test mode, generate exactly 1 multiple-choice question that is as hard, technical, and exam-like as possible
- Use exactly 4 options labeled A., B., C., and D.
- Put each option on its own line
- End quiz/test questions with: ANSWER_KEY: X
- Do not include the explanation unless explicitly asked
- When asked to explain an answer, explain why the correct answer is right and why incorrect options are wrong
- Keep all questions aligned to CompTIA Security+ SY0-701
- Respect requested unit and difficulty constraints when provided`
};

app.get("/config", (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ""
  });
});

app.post("/chat", async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required." });
    }

    const safeHistory = Array.isArray(history)
      ? history
          .filter(
            (item) =>
              item &&
              (item.role === "user" || item.role === "assistant") &&
              typeof item.content === "string"
          )
          .slice(-18)
      : [];

    const messages = [
      systemMessage,
      ...safeHistory,
      {
        role: "user",
        content: message
      }
    ];

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages
    });

    const reply = completion.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return res.status(500).json({ error: "Bot returned no text." });
    }

    res.json({ reply });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({
      error: error?.message || "Something went wrong."
    });
  }
});

app.post("/clear", (req, res) => {
  res.json({ message: "Chat cleared." });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});