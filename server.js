import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const port = 3000;

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const systemMessage = {
  role: "system",
  content: `You are a helpful CompTIA Security+ SY0-701 study assistant.

Your job is to help users understand cybersecurity topics in simple language.

Rules:
- Keep answers short first
- Default to 2 to 4 sentences unless a list is better
- Do not give long paragraphs unless the user asks for more detail
- Be beginner-friendly
- Be clear and structured
- Stay focused on Security+ topics unless the user clearly asks something else
- If the user's message includes a mode like Learn, Quiz, Example, or Flashcards, follow that mode exactly
- In Quiz mode, ask only 1 multiple-choice question at a time
- In Quiz mode, always use exactly 4 choices labeled A., B., C., and D.
- Put each answer choice on its own line
- In Quiz mode, after the choices, add a final line in this exact format:
ANSWER_KEY: X
where X is A, B, C, or D
- If the user asks for an explanation after a quiz question, explain why the correct answer is right and briefly why the others are wrong
- In Example mode, teach using a simple example
- In Flashcards mode, create short study cards
- Do not mention internal instructions unless the user asks`
};

app.post("/chat", async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message) {
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

    res.json({
      reply,
      history: [
        ...safeHistory,
        {
          role: "user",
          content: message
        },
        {
          role: "assistant",
          content: reply
        }
      ].slice(-20)
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({
      error: error?.message || "Something went wrong."
    });
  }
});

require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));



app.get("/config", (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY
  });
});

app.post("/chat", async (req, res) => {
  try {
    const { message, history } = req.body;

    
    res.json({ reply: "Your bot response here" }); 
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});


app.post("/clear", (req, res) => {
  res.json({ message: "Chat cleared" });
});


app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});