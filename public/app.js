const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const clearBtn = document.getElementById("clear-btn");
const modeSelect = document.getElementById("mode-select");
const suggestionButtons = document.querySelectorAll(".suggestion-btn");

const scoreBoard = document.getElementById("score-board");
const quizPanel = document.getElementById("quiz-panel");
const quizQuestionEl = document.getElementById("quiz-question");
const quizAnswerButtons = document.getElementById("quiz-answer-buttons");
const quizFeedbackEl = document.getElementById("quiz-feedback");

const quizActions = document.getElementById("quiz-actions");
const nextQuestionBtn = document.getElementById("next-question-btn");
const showExplanationBtn = document.getElementById("show-explanation-btn");

const scoreTotalEl = document.getElementById("score-total");
const scoreCorrectEl = document.getElementById("score-correct");
const scoreWrongEl = document.getElementById("score-wrong");

const STORAGE_KEY = "security_plus_synced_history";
const MODE_KEY = "security_plus_mode";
const SCORE_KEY = "security_plus_quiz_score";
const QUIZ_STATE_KEY = "security_plus_quiz_state";

let chatHistory = [];
let quizScore = {
  total: 0,
  correct: 0,
  wrong: 0
};

let quizState = {
  awaitingAnswer: false,
  correctAnswer: null,
  questionText: "",
  canShowExplanation: false,
  answerChoices: [],
  feedback: ""
};

function saveHistory() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chatHistory));
}

function loadHistory() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    chatHistory = [];
    return;
  }

  try {
    const parsed = JSON.parse(saved);

    if (Array.isArray(parsed)) {
      chatHistory = parsed.filter(
        (item) =>
          item &&
          (item.role === "user" || item.role === "assistant") &&
          typeof item.content === "string"
      );
    } else {
      chatHistory = [];
    }
  } catch (error) {
    console.error("Failed to parse saved history:", error);
    chatHistory = [];
  }
}

function saveMode() {
  localStorage.setItem(MODE_KEY, modeSelect.value);
}

function loadMode() {
  const savedMode = localStorage.getItem(MODE_KEY);
  if (savedMode) {
    modeSelect.value = savedMode;
  }
}

function saveScore() {
  localStorage.setItem(SCORE_KEY, JSON.stringify(quizScore));
}

function loadScore() {
  const saved = localStorage.getItem(SCORE_KEY);

  if (!saved) {
    updateScoreUI();
    return;
  }

  try {
    const parsed = JSON.parse(saved);
    quizScore = {
      total: Number(parsed.total) || 0,
      correct: Number(parsed.correct) || 0,
      wrong: Number(parsed.wrong) || 0
    };
  } catch (error) {
    console.error("Failed to parse score:", error);
  }

  updateScoreUI();
}

function saveQuizState() {
  localStorage.setItem(QUIZ_STATE_KEY, JSON.stringify(quizState));
}

function loadQuizState() {
  const saved = localStorage.getItem(QUIZ_STATE_KEY);

  if (!saved) return;

  try {
    const parsed = JSON.parse(saved);
    quizState = {
      awaitingAnswer: Boolean(parsed.awaitingAnswer),
      correctAnswer: parsed.correctAnswer || null,
      questionText: parsed.questionText || "",
      canShowExplanation: Boolean(parsed.canShowExplanation),
      answerChoices: Array.isArray(parsed.answerChoices) ? parsed.answerChoices : [],
      feedback: parsed.feedback || ""
    };
  } catch (error) {
    console.error("Failed to parse quiz state:", error);
  }
}

function updateScoreUI() {
  scoreTotalEl.textContent = quizScore.total;
  scoreCorrectEl.textContent = quizScore.correct;
  scoreWrongEl.textContent = quizScore.wrong;
}

function renderAnswerButtons() {
  quizAnswerButtons.innerHTML = "";

  if (!quizState.awaitingAnswer || !Array.isArray(quizState.answerChoices)) {
    return;
  }

  quizState.answerChoices.forEach((choice) => {
    const button = document.createElement("button");
    button.classList.add("answer-btn");
    button.textContent = `${choice.letter}. ${choice.text}`;
    button.addEventListener("click", () => {
      if (modeSelect.value !== "quiz" || !quizState.awaitingAnswer) return;
      handleQuizAnswer(choice.letter);
    });
    quizAnswerButtons.appendChild(button);
  });
}

function renderQuizPanel() {
  const isQuizMode = modeSelect.value === "quiz";
  const hasActiveQuiz =
    quizState.questionText ||
    quizState.awaitingAnswer ||
    quizState.feedback ||
    quizState.answerChoices.length > 0;

  quizPanel.classList.toggle("hidden", !(isQuizMode && hasActiveQuiz));

  if (!isQuizMode) {
    return;
  }

  quizQuestionEl.textContent =
    quizState.questionText || "Your quiz question will appear here.";

  if (quizState.feedback) {
    quizFeedbackEl.textContent = quizState.feedback;
    quizFeedbackEl.classList.remove("hidden");
  } else {
    quizFeedbackEl.textContent = "";
    quizFeedbackEl.classList.add("hidden");
  }

  renderAnswerButtons();
}

function updateQuizUI() {
  const isQuizMode = modeSelect.value === "quiz";

  scoreBoard.classList.toggle("hidden", !isQuizMode);
  quizActions.classList.toggle("hidden", !isQuizMode);

  nextQuestionBtn.disabled = !isQuizMode || quizState.awaitingAnswer;
  showExplanationBtn.disabled = !isQuizMode || !quizState.canShowExplanation;

  userInput.placeholder =
    isQuizMode && quizState.awaitingAnswer
      ? "Choose one of the answer buttons above..."
      : "Ask a Security+ question...";

  renderQuizPanel();
}

function renderChat() {
  chatBox.innerHTML = "";

  chatHistory.forEach((item) => {
    const sender = item.role === "user" ? "user" : "bot";
    addMessageToDOM(item.content, sender);
  });

  chatBox.scrollTop = chatBox.scrollHeight;
}

function addMessageToDOM(text, sender) {
  const messageDiv = document.createElement("div");
  messageDiv.classList.add("message", sender);
  messageDiv.textContent = text;
  chatBox.appendChild(messageDiv);
  return messageDiv;
}

function addMessageToHistory(role, content) {
  chatHistory.push({ role, content });

  if (chatHistory.length > 20) {
    chatHistory = chatHistory.slice(-20);
  }

  saveHistory();
}

function buildModePrompt(message, mode) {
  if (mode === "quiz") {
    return `Mode: Quiz
User topic/request: ${message}
Give 1 multiple-choice question at a time.
Use exactly 4 answer choices labeled A., B., C., and D.
Put each choice on its own line.
End with ANSWER_KEY: X`;
  }

  if (mode === "example") {
    return `Mode: Example
User topic/request: ${message}
Teach mainly through a simple real-world example. Keep it short first.`;
  }

  if (mode === "flashcards") {
    return `Mode: Flashcards
User topic/request: ${message}
Create 3 short flashcards in this format:
Term:
Definition:`;
  }

  return `Mode: Learn
User topic/request: ${message}
Explain it simply and briefly first.`;
}

function parseQuizAnswerKey(botReply) {
  const match = botReply.match(/ANSWER_KEY:\s*([ABCD])/i);
  return match ? match[1].toUpperCase() : null;
}

function parseQuizChoices(botReply) {
  const lines = botReply.split("\n");
  const choices = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    const match = trimmed.match(/^([ABCD])\.\s+(.+)$/i);

    if (match) {
      choices.push({
        letter: match[1].toUpperCase(),
        text: match[2].trim()
      });
    }
  });

  return choices;
}

function parseQuizQuestion(botReply) {
  const lines = botReply.split("\n");
  const questionLines = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^[ABCD]\.\s+/i.test(trimmed)) break;
    if (/^ANSWER_KEY:\s*[ABCD]/i.test(trimmed)) break;

    if (trimmed) {
      questionLines.push(trimmed);
    }
  }

  return questionLines.join("\n").trim();
}

function handleQuizAnswer(userAnswer) {
  const answer = userAnswer.trim().toUpperCase();
  const correct = quizState.correctAnswer;

  if (!correct) return false;

  quizScore.total += 1;
  addMessageToHistory("user", `Selected answer: ${answer}`);

  if (answer === correct) {
    quizScore.correct += 1;
    quizState.feedback = `Correct. The right answer was ${correct}. You can click Next Question or Show Explanation.`;
    addMessageToHistory("assistant", quizState.feedback);
  } else {
    quizScore.wrong += 1;
    quizState.feedback = `Not quite. The correct answer was ${correct}. Click Show Explanation or Next Question.`;
    addMessageToHistory("assistant", quizState.feedback);
  }

  quizState.awaitingAnswer = false;
  quizState.canShowExplanation = true;
  quizState.answerChoices = [];

  saveScore();
  saveQuizState();
  updateScoreUI();
  updateQuizUI();
  renderChat();

  return true;
}

async function requestBotReply(message, modeOverride = null) {
  const mode = modeOverride || modeSelect.value;
  const finalMessage = buildModePrompt(message, mode);

  addMessageToHistory("user", message);
  renderChat();

  const loadingMessage = addMessageToDOM("Typing...", "bot");
  chatBox.scrollTop = chatBox.scrollHeight;

  try {
    const historyWithoutLatestUserMessage = chatHistory.slice(0, -1);

    const response = await fetch("/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: finalMessage,
        history: historyWithoutLatestUserMessage
      })
    });

    const data = await response.json();
    loadingMessage.remove();

    if (!response.ok) {
      addMessageToHistory("assistant", data.error || "Server error.");
      renderChat();
      return;
    }

    const reply = data.reply || "Bot returned no text.";

    if (mode === "quiz") {
      const answerKey = parseQuizAnswerKey(reply);
      const answerChoices = parseQuizChoices(reply);
      const questionText = parseQuizQuestion(reply);

      if (answerKey && answerChoices.length === 4) {
        quizState.awaitingAnswer = true;
        quizState.correctAnswer = answerKey;
        quizState.questionText = questionText || "Quiz question";
        quizState.canShowExplanation = false;
        quizState.answerChoices = answerChoices;
        quizState.feedback = "";
        saveQuizState();
      } else {
        addMessageToHistory("assistant", "Could not format quiz question correctly.");
      }

      updateQuizUI();
      renderChat();
      return;
    }

    addMessageToHistory("assistant", reply);
    renderChat();
  } catch (error) {
    loadingMessage.remove();
    console.error("Frontend error:", error);
    addMessageToHistory("assistant", "Error talking to chatbot.");
    renderChat();
  }
}

async function sendMessage(customMessage = null) {
  const rawMessage = customMessage || userInput.value.trim();
  if (!rawMessage) return;

  if (modeSelect.value === "quiz" && quizState.awaitingAnswer) {
    return;
  }

  userInput.value = "";
  userInput.focus();
  await requestBotReply(rawMessage);
}

async function clearChat() {
  chatHistory = [];
  quizScore = {
    total: 0,
    correct: 0,
    wrong: 0
  };
  quizState = {
    awaitingAnswer: false,
    correctAnswer: null,
    questionText: "",
    canShowExplanation: false,
    answerChoices: [],
    feedback: ""
  };

  saveHistory();
  saveScore();
  saveQuizState();
  updateScoreUI();
  updateQuizUI();
  renderChat();

  try {
    await fetch("/clear", {
      method: "POST"
    });
  } catch (error) {
    console.error("Clear chat error:", error);
    addMessageToHistory("assistant", "Could not clear server chat state.");
    renderChat();
  }
}

async function nextQuestion() {
  if (modeSelect.value !== "quiz" || quizState.awaitingAnswer) return;
  await requestBotReply("Give me the next quiz question.", "quiz");
}

async function showExplanation() {
  if (modeSelect.value !== "quiz" || !quizState.canShowExplanation) return;

  const prompt = `Explain the last quiz question. The correct answer was ${quizState.correctAnswer}. Briefly explain why it is correct and why the other choices are less correct.`;

  addMessageToHistory("user", "Show explanation");
  renderChat();

  const loadingMessage = addMessageToDOM("Typing...", "bot");
  chatBox.scrollTop = chatBox.scrollHeight;

  try {
    const historyWithoutLatestUserMessage = chatHistory.slice(0, -1);

    const response = await fetch("/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: prompt,
        history: historyWithoutLatestUserMessage
      })
    });

    const data = await response.json();
    loadingMessage.remove();

    if (!response.ok) {
      addMessageToHistory("assistant", data.error || "Server error.");
      renderChat();
      return;
    }

    const explanation = data.reply || "No explanation returned.";
    addMessageToHistory("assistant", explanation);
    quizState.feedback = explanation;
    quizState.canShowExplanation = false;

    saveQuizState();
    updateQuizUI();
    renderChat();
  } catch (error) {
    loadingMessage.remove();
    console.error("Explanation error:", error);
    addMessageToHistory("assistant", "Error getting explanation.");
    renderChat();
  }
}

sendBtn.addEventListener("click", () => sendMessage());
clearBtn.addEventListener("click", clearChat);
nextQuestionBtn.addEventListener("click", nextQuestion);
showExplanationBtn.addEventListener("click", showExplanation);

userInput.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    sendMessage();
  }
});

modeSelect.addEventListener("change", function () {
  saveMode();
  updateQuizUI();
});

suggestionButtons.forEach((button) => {
  button.addEventListener("click", function () {
    const prompt = button.dataset.prompt;
    sendMessage(prompt);
  });
});

loadHistory();
loadMode();
loadScore();
loadQuizState();
renderChat();
updateScoreUI();
updateQuizUI();