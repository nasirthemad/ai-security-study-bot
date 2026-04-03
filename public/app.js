const { createApp } = Vue;
const { createClient } = supabase;

createApp({
  data() {
    return {
      supabaseClient: null,
      user: null,
      authEmail: "",
      authPassword: "",
      authMessage: "",

      userInput: "",
      mode: localStorage.getItem("security_plus_mode") || "learn",
      isLoading: false,
      chatHistory: JSON.parse(localStorage.getItem("security_plus_synced_history") || "[]"),
      quizScore: JSON.parse(localStorage.getItem("security_plus_quiz_score") || '{"total":0,"correct":0,"wrong":0}'),
      quizState: JSON.parse(localStorage.getItem("security_plus_quiz_state") || JSON.stringify({
        awaitingAnswer: false,
        correctAnswer: null,
        questionText: "",
        canShowExplanation: false,
        answerChoices: [],
        feedback: ""
      }))
    };
  },

  computed: {
    hasQuizPanel() {
      return !!(
        this.quizState.questionText ||
        this.quizState.awaitingAnswer ||
        this.quizState.feedback ||
        (this.quizState.answerChoices && this.quizState.answerChoices.length)
      );
    },

    inputPlaceholder() {
      if (this.mode === "quiz" && this.quizState.awaitingAnswer) {
        return "Choose one of the answer buttons above...";
      }
      return "Ask a Security+ question...";
    }
  },

  watch: {
  chatHistory: {
    deep: true,
    async handler(value) {
      localStorage.setItem("security_plus_synced_history", JSON.stringify(value));
      await this.saveUserProgress();
    }
  },
  quizScore: {
    deep: true,
    async handler(value) {
      localStorage.setItem("security_plus_quiz_score", JSON.stringify(value));
      await this.saveUserProgress();
    }
  },
  quizState: {
    deep: true,
    async handler(value) {
      localStorage.setItem("security_plus_quiz_state", JSON.stringify(value));
      await this.saveUserProgress();
    }
  },
  mode: {
    async handler(value) {
      localStorage.setItem("security_plus_mode", value);
      await this.saveUserProgress();
    }
  }
},

  async mounted() {
    try {
      const response = await fetch("/config");
      const config = await response.json();

      this.supabaseClient = createClient(config.supabaseUrl, config.supabaseAnonKey);

      const { data, error } = await this.supabaseClient.auth.getSession();

      if (error) {
        this.authMessage = error.message;
      }

      this.user = data?.session?.user || null;

      if (this.user) {
        await this.loadUserProgress();
      }

      this.supabaseClient.auth.onAuthStateChange(async (_event, session) => {
  this.user = session?.user || null;

  if (this.user) {
    await this.loadUserProgress();
  } else {
    this.chatHistory = [];
    this.quizScore = { total: 0, correct: 0, wrong: 0 };
    this.quizState = {
      awaitingAnswer: false,
      correctAnswer: null,
      questionText: "",
      canShowExplanation: false,
      answerChoices: [],
      feedback: ""
    };
  }
});
    } catch (error) {
      console.error(error);
      this.authMessage = "Could not load auth configuration.";
    }
  },

  methods: {
    async loadUserProgress() {
  if (!this.user || !this.supabaseClient) return;

  const { data, error } = await this.supabaseClient
    .from("user_progress")
    .select("*")
    .eq("user_id", this.user.id)
    .maybeSingle();

  if (error) {
    console.error("Load progress error:", error.message);
    return;
  }

  if (!data) return;

  this.mode = data.mode || "learn";
  this.chatHistory = Array.isArray(data.chat_history) ? data.chat_history : [];
  this.quizScore = data.quiz_score || { total: 0, correct: 0, wrong: 0 };
  this.quizState = data.quiz_state || {
    awaitingAnswer: false,
    correctAnswer: null,
    questionText: "",
    canShowExplanation: false,
    answerChoices: [],
    feedback: ""
  };
},

    async saveUserProgress() {
  if (!this.user || !this.supabaseClient) return;

  const payload = {
    user_id: this.user.id,
    mode: this.mode,
    chat_history: this.chatHistory,
    quiz_score: this.quizScore,
    quiz_state: this.quizState,
    updated_at: new Date().toISOString()
  };

  const { error } = await this.supabaseClient
    .from("user_progress")
    .upsert(payload);

  if (error) {
    console.error("Save progress error:", error.message);
  }
},

    async signUp() {
      this.authMessage = "";

      const { error } = await this.supabaseClient.auth.signUp({
        email: this.authEmail,
        password: this.authPassword
      });

      this.authMessage = error
        ? error.message
        : "Account created. Check your email if confirmation is required.";
    },

    async signIn() {
      this.authMessage = "";

      const { error } = await this.supabaseClient.auth.signInWithPassword({
        email: this.authEmail,
        password: this.authPassword
      });

      this.authMessage = error ? error.message : "Signed in successfully.";
    },

    async signOut() {
  await this.supabaseClient.auth.signOut();

  this.chatHistory = [];
  this.quizScore = { total: 0, correct: 0, wrong: 0 };
  this.quizState = {
    awaitingAnswer: false,
    correctAnswer: null,
    questionText: "",
    canShowExplanation: false,
    answerChoices: [],
    feedback: ""
  };
}

    addMessage(role, content) {
      this.chatHistory.push({ role, content });
      if (this.chatHistory.length > 20) {
        this.chatHistory = this.chatHistory.slice(-20);
      }
    },

    buildModePrompt(message, mode) {
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
    },

    parseQuizAnswerKey(botReply) {
      const match = botReply.match(/ANSWER_KEY:\s*([ABCD])/i);
      return match ? match[1].toUpperCase() : null;
    },

    parseQuizChoices(botReply) {
      return botReply
        .split("\n")
        .map(line => line.trim())
        .map(line => {
          const match = line.match(/^([ABCD])\.\s+(.+)$/i);
          return match ? { letter: match[1].toUpperCase(), text: match[2].trim() } : null;
        })
        .filter(Boolean);
    },

    parseQuizQuestion(botReply) {
      const lines = botReply.split("\n");
      const questionLines = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (/^[ABCD]\.\s+/i.test(trimmed)) break;
        if (/^ANSWER_KEY:\s*[ABCD]/i.test(trimmed)) break;
        if (trimmed) questionLines.push(trimmed);
      }

      return questionLines.join("\n").trim();
    },

    async requestBotReply(message, modeOverride = null) {
      const mode = modeOverride || this.mode;
      const finalMessage = this.buildModePrompt(message, mode);

      this.addMessage("user", message);
      this.isLoading = true;

      try {
        const historyWithoutLatestUserMessage = this.chatHistory.slice(0, -1);

        const response = await fetch("/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: finalMessage,
            history: historyWithoutLatestUserMessage
          })
        });

        const data = await response.json();
        this.isLoading = false;

        if (!response.ok) {
          this.addMessage("assistant", data.error || "Server error.");
          return;
        }

        const reply = data.reply || "Bot returned no text.";

        if (mode === "quiz") {
          const answerKey = this.parseQuizAnswerKey(reply);
          const answerChoices = this.parseQuizChoices(reply);
          const questionText = this.parseQuizQuestion(reply);

          if (answerKey && answerChoices.length === 4) {
            this.quizState.awaitingAnswer = true;
            this.quizState.correctAnswer = answerKey;
            this.quizState.questionText = questionText || "Quiz question";
            this.quizState.canShowExplanation = false;
            this.quizState.answerChoices = answerChoices;
            this.quizState.feedback = "";
          } else {
            this.addMessage("assistant", "Could not format quiz question correctly.");
          }

          return;
        }

        this.addMessage("assistant", reply);
      } catch (error) {
        this.isLoading = false;
        this.addMessage("assistant", "Error talking to chatbot.");
      }
    },

    async sendMessage(customMessage = null) {
      const rawMessage = customMessage || this.userInput.trim();
      if (!rawMessage) return;
      if (this.mode === "quiz" && this.quizState.awaitingAnswer) return;
      if (!this.user) return;

      this.userInput = "";
      await this.requestBotReply(rawMessage);
    },

    handleQuizAnswer(letter) {
      if (!this.quizState.correctAnswer) return;

      this.quizScore.total += 1;
      this.addMessage("user", `Selected answer: ${letter}`);

      if (letter === this.quizState.correctAnswer) {
        this.quizScore.correct += 1;
        this.quizState.feedback = `Correct. The right answer was ${this.quizState.correctAnswer}. You can click Next Question or Show Explanation.`;
      } else {
        this.quizScore.wrong += 1;
        this.quizState.feedback = `Not quite. The correct answer was ${this.quizState.correctAnswer}. Click Show Explanation or Next Question.`;
      }

      this.addMessage("assistant", this.quizState.feedback);
      this.quizState.awaitingAnswer = false;
      this.quizState.canShowExplanation = true;
      this.quizState.answerChoices = [];
    },

    async nextQuestion() {
      if (!this.user) return;
      if (this.mode !== "quiz" || this.quizState.awaitingAnswer) return;
      await this.requestBotReply("Give me the next quiz question.", "quiz");
    },

    async showExplanation() {
      if (!this.user) return;
      if (this.mode !== "quiz" || !this.quizState.canShowExplanation) return;

      const prompt = `Explain the last quiz question. The correct answer was ${this.quizState.correctAnswer}. Briefly explain why it is correct and why the other choices are less correct.`;

      this.addMessage("user", "Show explanation");
      this.isLoading = true;

      try {
        const historyWithoutLatestUserMessage = this.chatHistory.slice(0, -1);

        const response = await fetch("/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: prompt,
            history: historyWithoutLatestUserMessage
          })
        });

        const data = await response.json();
        this.isLoading = false;

        if (!response.ok) {
          this.addMessage("assistant", data.error || "Server error.");
          return;
        }

        const explanation = data.reply || "No explanation returned.";
        this.quizState.feedback = explanation;
        this.quizState.canShowExplanation = false;
        this.addMessage("assistant", explanation);
      } catch (error) {
        this.isLoading = false;
        this.addMessage("assistant", "Error getting explanation.");
      }
    },

    async clearChat() {
      this.chatHistory = [];
      this.quizScore = { total: 0, correct: 0, wrong: 0 };
      this.quizState = {
        awaitingAnswer: false,
        correctAnswer: null,
        questionText: "",
        canShowExplanation: false,
        answerChoices: [],
        feedback: ""
      };

      try {
        await fetch("/clear", { method: "POST" });
      } catch (error) {
        this.addMessage("assistant", "Could not clear server chat state.");
      }
    }
  }
}).mount("#app");