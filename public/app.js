const { createApp } = Vue;
const { createClient } = supabase;

createApp({
  data() {
    return {
      difficulty: localStorage.getItem("security_plus_difficulty") || "medium",
      selectedDomain: localStorage.getItem("security_plus_domain") || "any",

      userStats: JSON.parse(
        localStorage.getItem("security_plus_user_stats") ||
          JSON.stringify({
            answered: 0,
            correct: 0,
            wrong: 0
          })
      ),

      quizSession: JSON.parse(
        localStorage.getItem("security_plus_quiz_session") ||
          JSON.stringify({
            started: false,
            totalMainQuestions: 15,
            mainAnswered: 0,
            isReviewPhase: false,
            missedQuestions: [],
            reviewQueue: [],
            currentQuestionId: null,
            currentQuestion: null
          })
      ),

      supabaseClient: null,
      user: null,
      authEmail: "",
      authPassword: "",
      authMessage: "",

      userInput: "",
      mode: localStorage.getItem("security_plus_mode") || "learn",
      isLoading: false,
      chatHistory: JSON.parse(
        localStorage.getItem("security_plus_synced_history") || "[]"
      ),
      quizScore: JSON.parse(
        localStorage.getItem("security_plus_quiz_score") ||
          '{"total":0,"correct":0,"wrong":0}'
      ),
      quizState: JSON.parse(
        localStorage.getItem("security_plus_quiz_state") ||
          JSON.stringify({
            awaitingAnswer: false,
            correctAnswer: null,
            questionText: "",
            canShowExplanation: false,
            answerChoices: [],
            feedback: ""
          })
      )
    };
  },

  computed: {
    accuracyPercent() {
      if (!this.userStats.answered) return 0;
      return Math.round((this.userStats.correct / this.userStats.answered) * 100);
    },

    hasQuizPanel() {
      return !!(
        this.quizState.questionText ||
        this.quizState.awaitingAnswer ||
        this.quizState.feedback ||
        (this.quizState.answerChoices && this.quizState.answerChoices.length)
      );
    },

    inputPlaceholder() {
      if (
        (this.mode === "quiz" || this.mode === "test") &&
        this.quizState.awaitingAnswer
      ) {
        return "Choose one of the answer buttons above...";
      }
      return "Ask a Security+ question...";
    }
  },

  watch: {
    difficulty(value) {
      localStorage.setItem("security_plus_difficulty", value);
    },

    selectedDomain(value) {
      localStorage.setItem("security_plus_domain", value);
      this.saveUserProgress();
    },

    userStats: {
      deep: true,
      handler(value) {
        localStorage.setItem("security_plus_user_stats", JSON.stringify(value));
      }
    },

    quizSession: {
      deep: true,
      handler(value) {
        localStorage.setItem("security_plus_quiz_session", JSON.stringify(value));
      }
    },

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

      console.log("CONFIG RESPONSE:", config);

      if (!config.supabaseUrl || !config.supabaseAnonKey) {
        this.authMessage = "Missing Supabase config from /config.";
        return;
      }

      this.supabaseClient = createClient(
        config.supabaseUrl,
        config.supabaseAnonKey
      );

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
          this.userStats = {
            answered: 0,
            correct: 0,
            wrong: 0
          };
          this.quizSession = {
            started: false,
            totalMainQuestions: 15,
            mainAnswered: 0,
            isReviewPhase: false,
            missedQuestions: [],
            reviewQueue: [],
            currentQuestionId: null,
            currentQuestion: null
          };
        }
      });
    } catch (error) {
      console.error("MOUNT ERROR:", error);
      this.authMessage = "Could not load auth configuration.";
    }
  },

  methods: {
    startSession() {
      this.quizSession = {
        started: true,
        totalMainQuestions: this.mode === "test" ? 90 : 15,
        mainAnswered: 0,
        isReviewPhase: false,
        missedQuestions: [],
        reviewQueue: [],
        currentQuestionId: null,
        currentQuestion: null
      };

      this.quizState = {
        awaitingAnswer: false,
        correctAnswer: null,
        questionText: "",
        canShowExplanation: false,
        answerChoices: [],
        feedback: ""
      };

      this.nextQuestion();
    },

    buildQuestionObject() {
      return {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        questionText: this.quizState.questionText,
        answerChoices: JSON.parse(JSON.stringify(this.quizState.answerChoices)),
        correctAnswer: this.quizState.correctAnswer
      };
    },

    loadQuestionFromObject(questionObj) {
      this.quizState.awaitingAnswer = true;
      this.quizState.correctAnswer = questionObj.correctAnswer;
      this.quizState.questionText = questionObj.questionText;
      this.quizState.canShowExplanation = false;
      this.quizState.answerChoices = JSON.parse(
        JSON.stringify(questionObj.answerChoices)
      );
      this.quizState.feedback = "";
      this.quizSession.currentQuestionId = questionObj.id;
      this.quizSession.currentQuestion = questionObj;
    },

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
      this.selectedDomain = data.selected_domain || "any";
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
        selected_domain: this.selectedDomain,
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
      try {
        this.authMessage = "";

        if (!this.supabaseClient) {
          this.authMessage = "Supabase client is not loaded.";
          return;
        }

        if (!this.authEmail || !this.authPassword) {
          this.authMessage = "Enter your email and password.";
          return;
        }

        const { data, error } = await this.supabaseClient.auth.signUp({
          email: this.authEmail,
          password: this.authPassword
        });

        console.log("SIGN UP DATA:", data);
        console.log("SIGN UP ERROR:", error);

        this.authMessage = error
          ? error.message
          : "Account created. Check your email if confirmation is required.";
      } catch (err) {
        console.error("SIGN UP CRASH:", err);
        this.authMessage = err.message || "Sign up failed.";
      }
    },

    async signIn() {
      try {
        this.authMessage = "";

        if (!this.supabaseClient) {
          this.authMessage = "Supabase client is not loaded.";
          return;
        }

        if (!this.authEmail || !this.authPassword) {
          this.authMessage = "Enter your email and password.";
          return;
        }

        const { data, error } =
          await this.supabaseClient.auth.signInWithPassword({
            email: this.authEmail,
            password: this.authPassword
          });

        console.log("SIGN IN DATA:", data);
        console.log("SIGN IN ERROR:", error);

        this.authMessage = error ? error.message : "Signed in successfully.";
      } catch (err) {
        console.error("SIGN IN CRASH:", err);
        this.authMessage = err.message || "Sign in failed.";
      }
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
      this.userStats = {
        answered: 0,
        correct: 0,
        wrong: 0
      };
      this.quizSession = {
        started: false,
        totalMainQuestions: 15,
        mainAnswered: 0,
        isReviewPhase: false,
        missedQuestions: [],
        reviewQueue: [],
        currentQuestionId: null,
        currentQuestion: null
      };
    },

    addMessage(role, content) {
      this.chatHistory.push({ role, content });
      if (this.chatHistory.length > 20) {
        this.chatHistory = this.chatHistory.slice(-20);
      }
    },

    buildModePrompt(message, mode) {
      if (mode === "quiz") {
        const domainMap = {
          "1": "Domain 1. General Security Concepts",
          "2": "Domain 2. Threats, Vulnerabilities, and Mitigations",
          "3": "Domain 3. Security Architecture",
          "4": "Domain 4. Security Operations",
          "5": "Domain 5. Security Program Management and Oversight"
        };

        const domainText =
          this.selectedDomain === "any"
            ? "any of Domains 1 through 5"
            : domainMap[this.selectedDomain];

        return `Mode: Quiz
User topic/request: ${message}
Target Domain: ${domainText}
Difficulty: ${this.difficulty}
Generate exactly 1 CompTIA Security+ SY0-701 multiple-choice question.
Make it ${this.difficulty}.
Use exactly 4 answer choices labeled A., B., C., and D.
Put each choice on its own line.
Keep the question aligned to ${domainText}.
Do not give the explanation yet.
End with: ANSWER_KEY: X`;
      }

      if (mode === "test") {
        this.difficulty = "hard";

        return `Mode: Test
User topic/request: ${message}
Target Domain: any of Domains 1 through 5
Difficulty: hard
Generate exactly 1 CompTIA Security+ SY0-701 multiple-choice question.
Make it as hard, technical, and exam-like as possible.
Use exactly 4 answer choices labeled A., B., C., and D.
Put each choice on its own line.
Do not give the explanation yet.
End with: ANSWER_KEY: X`;
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
        .map((line) => line.trim())
        .map((line) => {
          const match = line.match(/^([ABCD])\.\s+(.+)$/i);
          return match
            ? { letter: match[1].toUpperCase(), text: match[2].trim() }
            : null;
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

        if (mode === "quiz" || mode === "test") {
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

            const questionObj = this.buildQuestionObject();
            this.quizSession.currentQuestion = questionObj;
            this.quizSession.currentQuestionId = questionObj.id;
          } else {
            this.addMessage(
              "assistant",
              "Could not format quiz question correctly."
            );
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
      if (
        (this.mode === "quiz" || this.mode === "test") &&
        this.quizState.awaitingAnswer
      ) {
        return;
      }
      if (!this.user) return;

      this.userInput = "";
      await this.requestBotReply(rawMessage);
    },

    async handleQuizAnswer(letter) {
      if (!this.quizState.correctAnswer) return;

      const selected = letter.toUpperCase();
      const correct = this.quizState.correctAnswer;

      this.userStats.answered += 1;
      this.quizSession.mainAnswered += this.quizSession.isReviewPhase ? 0 : 1;

      this.addMessage("user", `Selected answer: ${selected}`);

      const currentQuestion = this.quizSession.currentQuestion;

      const wasCorrect = selected === correct;

      if (wasCorrect) {
        this.userStats.correct += 1;
      } else {
        this.userStats.wrong += 1;

        const alreadyTracked = this.quizSession.missedQuestions.some(
          (q) => q.id === currentQuestion.id
        );

        if (!alreadyTracked) {
          this.quizSession.missedQuestions.push(currentQuestion);
        }
      }

      this.quizState.awaitingAnswer = false;
      this.quizState.canShowExplanation = false;
      this.quizState.answerChoices = [];

      const choicesText = currentQuestion.answerChoices
        .map((c) => `${c.letter}. ${c.text}`)
        .join("\n");

      const explanationPrompt = `Explain this Security+ question.

Question:
${currentQuestion.questionText}

Choices:
${choicesText}

User selected: ${selected}
Correct answer: ${correct}

Respond in this format:

CORRECTNESS:
- State if the user was correct or incorrect

EXPLANATION:
- Deep technical explanation of the correct answer

WHY OTHERS ARE WRONG:
- Briefly explain why each incorrect option is wrong

Keep it concise but high-level like a real exam explanation.`;

      this.isLoading = true;

      try {
        const historyWithoutLatestUserMessage = this.chatHistory.slice();

        const response = await fetch("/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: explanationPrompt,
            history: historyWithoutLatestUserMessage
          })
        });

        const data = await response.json();
        this.isLoading = false;

        const explanation =
          data.reply ||
          (wasCorrect
            ? `Correct. The right answer was ${correct}.`
            : `Wrong. The correct answer was ${correct}.`);

        this.quizState.feedback = explanation;
        this.addMessage("assistant", explanation);
      } catch (error) {
        this.isLoading = false;
        this.quizState.feedback = wasCorrect
          ? `Correct. The right answer was ${correct}.`
          : `Wrong. The correct answer was ${correct}.`;
        this.addMessage("assistant", this.quizState.feedback);
      }
    },

    async nextQuestion() {
      if (!this.user) return;
      if (!this.quizSession.started) return;
      if (this.quizState.awaitingAnswer) return;

      if (
        this.quizSession.mainAnswered >= this.quizSession.totalMainQuestions &&
        !this.quizSession.isReviewPhase
      ) {
        this.quizSession.isReviewPhase = true;
        this.quizSession.reviewQueue = [...this.quizSession.missedQuestions];
      }

      if (this.quizSession.isReviewPhase) {
        if (this.quizSession.reviewQueue.length === 0) {
          this.quizState.questionText =
            "Session complete. You finished all main and missed questions.";
          this.quizState.answerChoices = [];
          this.quizState.awaitingAnswer = false;
          this.quizState.feedback =
            "Great work. Start a new session when you're ready.";
          return;
        }

        const nextMissed = this.quizSession.reviewQueue.shift();
        this.loadQuestionFromObject(nextMissed);
        return;
      }

      const topicPrompt =
        this.mode === "test"
          ? "Give me the next question for the full random test."
          : `Give me the next question for my ${
              this.selectedDomain === "any"
                ? "any-domain"
                : `Domain ${this.selectedDomain}`
            } quiz.`;

      await this.requestBotReply(topicPrompt, this.mode);
    },

    async showExplanation() {
      if (!this.user) return;
      if (
        (this.mode !== "quiz" && this.mode !== "test") ||
        !this.quizState.canShowExplanation
      ) {
        return;
      }

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
      this.userStats = {
        answered: 0,
        correct: 0,
        wrong: 0
      };

      this.quizSession = {
        started: false,
        totalMainQuestions: 15,
        mainAnswered: 0,
        isReviewPhase: false,
        missedQuestions: [],
        reviewQueue: [],
        currentQuestionId: null,
        currentQuestion: null
      };

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