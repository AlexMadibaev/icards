import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Bell,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Download,
  Flame,
  FolderPlus,
  Languages,
  ListChecks,
  Mic,
  Moon,
  Plus,
  RotateCcw,
  Settings2,
  Share2,
  Shuffle,
  Smartphone,
  Sparkles,
  Sun,
  Target,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import defaultAnswersRaw from "./data/answers.txt?raw";
import defaultQuestionsRaw from "./data/questions.txt?raw";
import { getWordMetadata } from "./data/wordMetadata";
import {
  applyReview,
  evaluateAnswer,
  getStreak,
  isDue,
  parseSyncData,
  serializeSyncData,
  updateDailyProgress,
} from "./learningEngine";

const emptyAnswer = "Перевод не добавлен";
const themeStorageKey = "italian-cards-theme";
const statusStorageKey = "italian-cards-statuses";
const appDataStorageKey = "icards:app:v2";
const notificationStorageKey = "icards:last-reminder";
const installDismissedStorageKey = "icards:pwa-install-dismissed";
const defaultTicketStatus = "unlearned";
const defaultSettings = {
  direction: "it-ru",
  exerciseMode: "typing",
  category: "all",
  level: "all",
  queueMode: "all",
  notifications: false,
};
const defaultProfile = {
  name: "",
  level: null,
  selfAssessedLevel: null,
  onboardingCompleted: false,
  xp: 0,
  streak: 0,
  dailyGoal: 10,
  dailyHistory: {},
};
const placementQuestions = [
  {
    prompt: "Что означает «ciao»?",
    options: ["Спасибо", "Привет", "Извини", "Пожалуйста"],
    correctIndex: 1,
  },
  {
    prompt: "Выбери перевод слова «famiglia»",
    options: ["Работа", "Дорога", "Семья", "Комната"],
    correctIndex: 2,
  },
  {
    prompt: "Как по-итальянски будет «завтра»?",
    options: ["ieri", "oggi", "sera", "domani"],
    correctIndex: 3,
  },
  {
    prompt: "Что означает глагол «capire»?",
    options: ["Понимать", "Говорить", "Приходить", "Учиться"],
    correctIndex: 0,
  },
  {
    prompt: "Выбери правильный перевод: «Come stai?»",
    options: ["Куда ты идёшь?", "Как тебя зовут?", "Как ты?", "Сколько стоит?"],
    correctIndex: 2,
  },
  {
    prompt: "Закончи фразу: «Vorrei ___ caffè»",
    options: ["una", "un", "uno", "gli"],
    correctIndex: 1,
  },
  {
    prompt: "Что означает «Ho mangiato»?",
    options: ["Я буду есть", "Я ем", "Я поел", "Я не ем"],
    correctIndex: 2,
  },
  {
    prompt: "Выбери правильную форму: «___ amici italiani»",
    options: ["Il", "Lo", "Gli", "La"],
    correctIndex: 2,
  },
  {
    prompt: "Что означает: «Se avessi tempo, viaggerei»?",
    options: ["Когда будет время, я позвоню", "Если бы у меня было время, я бы путешествовал", "У меня нет времени на поездку", "Я путешествовал долго"],
    correctIndex: 1,
  },
];
const ticketStatuses = [
  {
    value: "learned",
    label: "Знаю",
    hint: "1",
    icon: Check,
  },
  {
    value: "repeat",
    label: "Повторить",
    hint: "2",
    icon: RotateCcw,
  },
  {
    value: "unlearned",
    label: "Не знаю",
    hint: "3",
    icon: X,
  },
];

const cardSwapVariants = {
  enter: (direction) => ({
    opacity: 0,
    x: direction > 0 ? 72 : -72,
    scale: 0.96,
  }),
  center: {
    opacity: 1,
    x: 0,
    scale: 1,
  },
  exit: (direction) => ({
    opacity: 0,
    x: direction > 0 ? -72 : 72,
    scale: 0.96,
  }),
};

function loadSharedState() {
  const state = loadDefaultState();

  return {
    ...state,
    tickets: applySavedStatuses(state.tickets),
  };
}

function loadDefaultState() {
  const answerTickets = parseAnswers(defaultAnswersRaw);
  const groupedTickets = mergeTicketsWithAnswers(parseTickets(defaultQuestionsRaw), answerTickets);
  const tickets = groupedTickets.flatMap((group) =>
    group.questions.map((word, wordIndex) => {
      const metadata = getWordMetadata(group.id);

      return {
        id: `${group.id}-${wordIndex}`,
        title: `Слово ${group.id * 5 + wordIndex + 1}`,
        number: String(group.id * 5 + wordIndex + 1),
        questions: [word],
        answers: [group.answers[wordIndex] || emptyAnswer],
        status: defaultTicketStatus,
        category: metadata?.category || "Другое",
        categoryEmoji: metadata?.emoji || "📚",
        categoryLabel: metadata?.label || "Итальянские слова",
        level: metadata?.level || "A1",
        source: "default",
      };
    }),
  );

  return {
    tickets,
  };
}

function getTicketNumber(title) {
  return title.match(/\d+/)?.[0] || "";
}

function getTicketKey(ticket) {
  return ticket.number || ticket.title;
}

function loadSavedStatuses() {
  try {
    const saved = localStorage.getItem(statusStorageKey);
    const parsed = saved ? JSON.parse(saved) : {};

    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function applySavedStatuses(tickets) {
  const savedStatuses = loadSavedStatuses();

  return tickets.map((ticket) => ({
    ...ticket,
    status: savedStatuses[getTicketKey(ticket)] || ticket.status || defaultTicketStatus,
  }));
}

function loadAppData() {
  try {
    const saved = localStorage.getItem(appDataStorageKey);
    const parsed = saved ? JSON.parse(saved) : {};

    return {
      version: 2,
      settings: {
        ...defaultSettings,
        ...(parsed.settings && typeof parsed.settings === "object" ? parsed.settings : {}),
      },
      profile: {
        ...defaultProfile,
        ...(parsed.profile && typeof parsed.profile === "object" ? parsed.profile : {}),
      },
      progress: parsed.progress && typeof parsed.progress === "object" ? parsed.progress : {},
      customWords: Array.isArray(parsed.customWords) ? parsed.customWords : [],
    };
  } catch {
    return {
      version: 2,
      settings: { ...defaultSettings },
      profile: { ...defaultProfile },
      progress: {},
      customWords: [],
    };
  }
}

function normalizeCustomWord(word, index) {
  if (!word || typeof word !== "object") {
    return null;
  }

  const italian = String(word.questions?.[0] || word.italian || "").trim();
  const russian = String(word.answers?.[0] || word.russian || "").trim();

  if (!italian || !russian) {
    return null;
  }

  return {
    ...word,
    id: String(word.id || `custom-${Date.now()}-${index}`),
    title: word.title || "Своё слово",
    number: word.number || `C${index + 1}`,
    questions: [italian],
    answers: [russian],
    status: word.status || defaultTicketStatus,
    category: String(word.category || "Мои слова"),
    categoryEmoji: word.categoryEmoji || "✍️",
    categoryLabel: word.categoryLabel || "Добавлено пользователем",
    level: ["A1", "A2", "B1"].includes(word.level) ? word.level : "A1",
    source: "custom",
  };
}

function buildInitialAppState() {
  const content = loadSharedState();
  const savedData = loadAppData();
  const customWords = savedData.customWords.map(normalizeCustomWord).filter(Boolean);
  const catalog = [...content.tickets, ...customWords];
  const tickets = catalog.map((ticket) => {
    const savedProgress = savedData.progress[ticket.id];

    return savedProgress && typeof savedProgress === "object"
      ? { ...ticket, ...savedProgress, id: ticket.id, questions: ticket.questions, answers: ticket.answers }
      : ticket;
  });

  return {
    tickets,
    settings: savedData.settings,
    profile: {
      ...savedData.profile,
      streak: getStreak(savedData.profile.dailyHistory),
    },
  };
}

function getTodayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildChoiceOptions(ticket, allTickets, direction) {
  if (!ticket) {
    return [];
  }

  const getExpected = (item) => direction === "it-ru" ? item.answers[0] : item.questions[0];
  const correctAnswer = getExpected(ticket);
  const sameCategory = allTickets.filter(
    (item) => item.id !== ticket.id && item.category === ticket.category,
  );
  const otherWords = allTickets.filter(
    (item) => item.id !== ticket.id && item.category !== ticket.category,
  );
  const distractors = [...sameCategory, ...otherWords]
    .map(getExpected)
    .filter((value, index, values) => value && value !== correctAnswer && values.indexOf(value) === index)
    .slice(0, 3);
  const insertAt = Math.abs(String(ticket.id).split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)) % 4;
  const options = [...distractors];
  options.splice(Math.min(insertAt, options.length), 0, correctAnswer);

  return options;
}

function parseNumberedItems(block) {
  const items = [];
  let current = null;

  block.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed || /^Набор\s*№?\s*\d+/i.test(trimmed) || isJunkLine(trimmed)) {
      return;
    }

    const match = trimmed.match(/^(\d+)[.)]\s*(.+)$/);

    if (match) {
      current = {
        number: Number(match[1]),
        text: match[2].trim(),
      };
      items.push(current);
      return;
    }

    if (current) {
      current.text = `${current.text} ${trimmed}`;
    }
  });

  return items;
}

function isJunkLine(line) {
  const withoutSpaces = line.replace(/\s/g, "");

  return /^[-_=*~.]{3,}$/.test(withoutSpaces);
}

function parseTickets(text) {
  const blocks = text.split(/(?=Набор\s*№?\s*\d+)/gi);

  return blocks
    .map((block, i) => {
      const title = block.match(/Набор\s*№?\s*\d+/i)?.[0] || `Набор ${i + 1}`;
      const items = parseNumberedItems(block);
      const questions = items.map((item) => item.text);

      return {
        id: i,
        title,
        number: getTicketNumber(title),
        questions,
        answers: questions.map(() => emptyAnswer),
        status: defaultTicketStatus,
      };
    })
    .filter((ticket) => ticket.questions.length);
}

function parseAnswers(text) {
  return parseTickets(text).map((ticket) => ({
    ...ticket,
    answers: ticket.questions,
  }));
}

function mergeTicketsWithAnswers(tickets, answerTickets) {
  return tickets.map((ticket, ticketIndex) => {
    const answerTicket =
      answerTickets.find((item) => item.number && item.number === ticket.number) ||
      answerTickets[ticketIndex];

    return {
      ...ticket,
      status: ticket.status || defaultTicketStatus,
      answers: ticket.questions.map((_, questionIndex) => {
        return answerTicket?.answers[questionIndex] || emptyAnswer;
      }),
    };
  });
}

function Card({
  ticket,
  prompt,
  expectedAnswer,
  direction,
  exerciseMode,
  choiceOptions,
  onStatusChange,
  onAdvance,
  onSwipe,
}) {
  const [flip, setFlip] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [answer, setAnswer] = useState("");
  const [answerResult, setAnswerResult] = useState(null);
  const [inputError, setInputError] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const inputRef = useRef(null);
  const shouldReduceMotion = useReducedMotion();

  function pronounceWord(event) {
    if (!("speechSynthesis" in window)) {
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(ticket.questions[0]);
    utterance.lang = "it-IT";
    utterance.rate = 0.82;
    window.speechSynthesis.speak(utterance);
  }

  function startVoiceAnswer() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechError("Голосовой ввод не поддерживается в этом браузере");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = direction === "ru-it" ? "it-IT" : "ru-RU";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      setSpeechError("");
      setIsListening(true);
    };
    recognition.onresult = (event) => {
      const spokenAnswer = event.results?.[0]?.[0]?.transcript || "";
      setAnswer(spokenAnswer);

      if (spokenAnswer) {
        finishAnswer(evaluateAnswer(spokenAnswer, expectedAnswer));
      }
    };
    recognition.onerror = () => setSpeechError("Не удалось распознать ответ. Попробуй ещё раз");
    recognition.onend = () => setIsListening(false);
    recognition.start();
  }

  function finishAnswer(status) {
    if (answerResult) {
      return;
    }

    setFeedback(status);
    setAnswerResult(status);
    setFlip(true);
  }

  function handleAnswerSubmit(event) {
    event.preventDefault();

    if (!answer.trim()) {
      setInputError(true);
      inputRef.current?.focus();
      return;
    }

    finishAnswer(evaluateAnswer(answer, expectedAnswer));
  }

  function handleChoiceSelect(option) {
    setAnswer(option);
    finishAnswer(evaluateAnswer(option, expectedAnswer));
  }

  function handleDragEnd(_, info) {
    if (Math.abs(info.offset.x) < 75 || Math.abs(info.velocity.x) < 180) {
      return;
    }

    onSwipe(info.offset.x < 0 ? "next" : "previous");
  }

  const feedbackMotion = feedback === "learned"
    ? { y: [0, -9, 0], scale: [1, 1.015, 1] }
    : feedback === "repeat"
      ? { scale: [1, 0.985, 1.015, 1] }
      : feedback === "unlearned"
        ? { x: [0, -7, 7, -5, 5, 0] }
        : {};

  const FeedbackIcon = ticketStatuses.find((status) => status.value === feedback)?.icon;
  const resultMessages = {
    learned: {
      title: "Верно!",
      description: "Отличный ответ — слово засчитано.",
    },
    repeat: {
      title: "Почти правильно",
      description: "Есть небольшая опечатка. Посмотри на правильный ответ.",
    },
    unlearned: {
      title: "Пока неверно",
      description: answer.trim() ? `Твой ответ: ${answer.trim()}` : "Запомни правильный перевод.",
    },
  };
  const ResultIcon = ticketStatuses.find((status) => status.value === answerResult)?.icon;

  return (
    <motion.article
      className={`study-card status-${ticket.status || defaultTicketStatus}`}
      animate={shouldReduceMotion ? {} : feedbackMotion}
      transition={{ duration: 0.42, ease: "easeOut" }}
    >
      <motion.div
        className="card-button"
        drag={shouldReduceMotion ? false : "x"}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.12}
        onDragEnd={handleDragEnd}
      >
        <motion.div
          className="card-inner"
          animate={{ rotateY: flip ? 180 : 0 }}
          transition={{ duration: shouldReduceMotion ? 0.01 : 0.52, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="card-side">
            <div className="card-meta">
              <span className="face-label">
                {direction === "it-ru" ? "Итальянский → русский" : "Русский → итальянский"}
              </span>
              {(direction === "it-ru" || answerResult) && (
                <motion.button
                  className="sound-button"
                  type="button"
                  aria-label={`Прослушать произношение слова ${ticket.questions[0]}`}
                  onClick={pronounceWord}
                  whileHover={shouldReduceMotion ? undefined : { scale: 1.08 }}
                  whileTap={shouldReduceMotion ? undefined : { scale: 0.92 }}
                >
                  <Volume2 size={22} />
                </motion.button>
              )}
            </div>
            <div className="single-word">{prompt}</div>
            <span className="flip-hint">
              {exerciseMode === "choice" ? "Выбери правильный ответ ниже" : "Введи ответ или используй микрофон"}
            </span>
          </div>

          <div className="card-side card-back">
            <span className="face-label">Правильный ответ</span>
            <div className="single-word translation">{expectedAnswer}</div>
            <span className="flip-hint">Нажми «Дальше», чтобы продолжить</span>
          </div>
        </motion.div>
        <AnimatePresence>
          {feedback && FeedbackIcon && (
            <motion.div
              className={`feedback-burst feedback-${feedback}`}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.25 }}
              aria-live="polite"
            >
              <FeedbackIcon size={34} strokeWidth={3} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence mode="wait" initial={false}>
        {!answerResult && exerciseMode === "choice" ? (
          <motion.div
            className="choice-panel"
            key="choice-panel"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <span className="answer-label">Выбери один вариант</span>
            <div className="choice-grid">
              {choiceOptions.map((option, index) => (
                <motion.button
                  className="choice-button"
                  key={option}
                  type="button"
                  onClick={() => handleChoiceSelect(option)}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: shouldReduceMotion ? 0 : index * 0.045 }}
                  whileHover={shouldReduceMotion ? undefined : { y: -2 }}
                  whileTap={shouldReduceMotion ? undefined : { y: 2 }}
                >
                  <span>{index + 1}</span>
                  {option}
                </motion.button>
              ))}
            </div>
            <button className="skip-answer-button" type="button" onClick={() => finishAnswer("unlearned")}>
              Не знаю — показать ответ
            </button>
          </motion.div>
        ) : !answerResult ? (
          <motion.form
            className="answer-form"
            key="answer-form"
            onSubmit={handleAnswerSubmit}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <label className="answer-label" htmlFor={`answer-${ticket.id}`}>
              {exerciseMode === "speaking"
                ? direction === "it-ru" ? "Произнеси перевод по-русски" : "Произнеси слово по-итальянски"
                : direction === "it-ru" ? "Напиши перевод на русском" : "Напиши слово по-итальянски"}
            </label>
            <div className="answer-entry-row">
              <motion.input
                ref={inputRef}
                id={`answer-${ticket.id}`}
                className={inputError ? "answer-input has-error" : "answer-input"}
                value={answer}
                type="text"
                autoComplete="off"
                placeholder={direction === "it-ru" ? "Например: привет" : "Например: ciao"}
                aria-invalid={inputError}
                onChange={(event) => {
                  setAnswer(event.target.value);
                  setInputError(false);
                }}
                animate={inputError && !shouldReduceMotion ? { x: [0, -6, 6, -4, 4, 0] } : {}}
              />
              <motion.button
                className={isListening ? "voice-answer-button listening" : "voice-answer-button"}
                type="button"
                aria-label="Ответить голосом"
                title="Ответить голосом"
                onClick={startVoiceAnswer}
                whileTap={shouldReduceMotion ? undefined : { scale: 0.94 }}
              >
                <Mic size={20} />
              </motion.button>
              <motion.button
                className="check-answer-button"
                type="submit"
                disabled={!answer.trim()}
                whileHover={shouldReduceMotion || !answer.trim() ? undefined : { y: -2 }}
                whileTap={shouldReduceMotion || !answer.trim() ? undefined : { y: 2 }}
              >
                <Check size={20} />
                Проверить
              </motion.button>
            </div>
            {speechError && <span className="speech-error" role="alert">{speechError}</span>}
            <button className="skip-answer-button" type="button" onClick={() => finishAnswer("unlearned")}>
              Не знаю — показать ответ
            </button>
          </motion.form>
        ) : (
          <motion.div
            className={`answer-result result-${answerResult}`}
            key="answer-result"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            <div className="result-copy">
              <span className="result-icon">{ResultIcon && <ResultIcon size={25} strokeWidth={3} />}</span>
              <div>
                <strong>{resultMessages[answerResult].title}</strong>
                <span>{resultMessages[answerResult].description}</span>
              </div>
            </div>
            <motion.button
              className="continue-button"
              type="button"
              onClick={() => {
                onStatusChange(ticket.id, answerResult);
                onAdvance();
              }}
              whileHover={shouldReduceMotion ? undefined : { y: -2 }}
              whileTap={shouldReduceMotion ? undefined : { y: 2 }}
            >
              Дальше
              <ArrowRight size={20} />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

function Onboarding({ profile, onComplete }) {
  const [step, setStep] = useState("name");
  const [name, setName] = useState(profile.name || "");
  const [selfLevel, setSelfLevel] = useState(profile.selfAssessedLevel || "");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [resultLevel, setResultLevel] = useState(null);
  const answerTimer = useRef(null);
  const question = placementQuestions[questionIndex];

  useEffect(() => () => window.clearTimeout(answerTimer.current), []);

  function submitName(event) {
    event.preventDefault();

    if (name.trim()) {
      setStep("level");
    }
  }

  function startTest() {
    if (selfLevel) {
      setStep("test");
    }
  }

  function answerQuestion(optionIndex) {
    if (selectedOption !== null) {
      return;
    }

    const isCorrect = optionIndex === question.correctIndex;
    const nextScore = score + (isCorrect ? 1 : 0);
    setSelectedOption(optionIndex);

    answerTimer.current = window.setTimeout(() => {
      if (questionIndex === placementQuestions.length - 1) {
        const level = nextScore <= 3 ? "A1" : nextScore <= 6 ? "A2" : "B1";
        setScore(nextScore);
        setResultLevel(level);
        setStep("result");
        return;
      }

      setScore(nextScore);
      setQuestionIndex((index) => index + 1);
      setSelectedOption(null);
    }, 420);
  }

  function finishOnboarding() {
    onComplete({
      name: name.trim(),
      selfAssessedLevel: selfLevel,
      level: resultLevel,
      placementScore: score,
      onboardingCompleted: true,
    });
  }

  return (
    <motion.div
      className="onboarding-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Настройка профиля и определение уровня"
      initial={false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.section
        className="onboarding-panel"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 260, damping: 25 }}
      >
        <div className="onboarding-brand">
          <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" />
          <span>iCards</span>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {step === "name" && (
            <motion.form className="onboarding-step" key="name" onSubmit={submitName} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
              <span className="onboarding-kicker">Benvenuto!</span>
              <h1>Давай познакомимся</h1>
              <p>Как тебя зовут? Мы будем использовать имя в целях и статистике обучения.</p>
              <label className="onboarding-name-field">
                <span>Твоё имя</span>
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Например: Александр" autoComplete="name" />
              </label>
              <button className="onboarding-primary" type="submit" disabled={!name.trim()}>
                Продолжить <ArrowRight size={19} />
              </button>
            </motion.form>
          )}

          {step === "level" && (
            <motion.div className="onboarding-step" key="level" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
              <span className="onboarding-kicker">Ciao, {name.trim()}!</span>
              <h1>Какой у тебя уровень?</h1>
              <p>Выбери свою оценку. Затем короткий тест точнее определит стартовый уровень.</p>
              <div className="self-level-grid">
                {[
                  ["beginner", "С нуля", "Только начинаю"],
                  ["A1", "A1", "Знаю базовые слова"],
                  ["A2", "A2", "Понимаю простые фразы"],
                  ["B1", "B1+", "Могу поддержать разговор"],
                  ["unknown", "Не знаю", "Пусть решит тест"],
                ].map(([value, label, description]) => (
                  <button className={selfLevel === value ? "selected" : ""} type="button" key={value} onClick={() => setSelfLevel(value)}>
                    <strong>{label}</strong><span>{description}</span>
                  </button>
                ))}
              </div>
              <button className="onboarding-primary" type="button" disabled={!selfLevel} onClick={startTest}>
                Начать тест <ListChecks size={19} />
              </button>
            </motion.div>
          )}

          {step === "test" && (
            <motion.div className="onboarding-step placement-step" key={`test-${questionIndex}`} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
              <div className="placement-progress-copy"><span>Определение уровня</span><strong>{questionIndex + 1}/{placementQuestions.length}</strong></div>
              <div className="placement-progress"><motion.div initial={{ scaleX: questionIndex / placementQuestions.length }} animate={{ scaleX: (questionIndex + 1) / placementQuestions.length }} /></div>
              <h1>{question.prompt}</h1>
              <div className="placement-options">
                {question.options.map((option, index) => {
                  const isSelected = selectedOption === index;
                  const isCorrect = selectedOption !== null && index === question.correctIndex;
                  const isWrong = isSelected && index !== question.correctIndex;
                  const stateClass = isCorrect ? "correct" : isWrong ? "wrong" : isSelected ? "selected" : "";

                  return (
                    <button className={stateClass} type="button" key={option} onClick={() => answerQuestion(index)}>
                      <span>{String.fromCharCode(65 + index)}</span>{option}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {step === "result" && (
            <motion.div className="onboarding-step onboarding-result" key="result" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="result-level-badge" initial={{ rotate: -8, scale: 0.6 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 280, damping: 18 }}>{resultLevel}</motion.div>
              <span className="onboarding-kicker">Тест завершён</span>
              <h1>Твой уровень — {resultLevel}</h1>
              <p>Правильных ответов: {score} из {placementQuestions.length}. Мы сохраним результат и подберём подходящие упражнения.</p>
              <button className="onboarding-primary" type="button" onClick={finishOnboarding}>
                Начать обучение <Sparkles size={19} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
    </motion.div>
  );
}

function Modal({ title, icon: Icon, onClose, children }) {
  return (
    <motion.div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.section
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 280, damping: 26 }}
      >
        <div className="modal-head">
          <div>
            {Icon && <Icon size={22} />}
            <h2>{title}</h2>
          </div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </motion.section>
    </motion.div>
  );
}

export default function App() {
  const [initialState] = useState(() => buildInitialAppState());
  const [tickets, setTickets] = useState(initialState.tickets);
  const [settings, setSettings] = useState(initialState.settings);
  const [profile, setProfile] = useState(initialState.profile);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState(1);
  const [activeModal, setActiveModal] = useState(null);
  const [syncText, setSyncText] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [showInstallOffer, setShowInstallOffer] = useState(false);
  const [isInstalled, setIsInstalled] = useState(() => (
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true
  ));
  const [isIOSDevice] = useState(() => /iphone|ipad|ipod/i.test(navigator.userAgent));
  const [isAndroidDevice] = useState(() => /android/i.test(navigator.userAgent));
  const [theme, setTheme] = useState(() => localStorage.getItem(themeStorageKey) || "light");
  const shouldReduceMotion = useReducedMotion();

  const categories = useMemo(
    () => [...new Set(tickets.map((ticket) => ticket.category).filter(Boolean))],
    [tickets],
  );
  const studyTickets = useMemo(() => {
    const filtered = tickets.filter((ticket) => {
      const categoryMatches = settings.category === "all" || ticket.category === settings.category;
      const levelMatches = settings.level === "all" || ticket.level === settings.level;
      const queueMatches = settings.queueMode !== "due" || isDue(ticket, new Date(clock));
      return categoryMatches && levelMatches && queueMatches;
    });

    return [...filtered].sort((first, second) => {
      if (settings.queueMode !== "due") {
        return 0;
      }

      return (Date.parse(first.dueAt || 0) || 0) - (Date.parse(second.dueAt || 0) || 0);
    });
  }, [tickets, settings.category, settings.level, settings.queueMode, clock]);
  const currentTicket = studyTickets[currentIndex] || studyTickets[0];
  const learnedCount = tickets.filter((ticket) => ticket.status === "learned").length;
  const repeatCount = tickets.filter((ticket) => ticket.status === "repeat").length;
  const unlearnedCount = tickets.filter((ticket) => ticket.status === "unlearned").length;
  const dueCount = tickets.filter((ticket) => isDue(ticket, new Date(clock))).length;
  const progressPercent = tickets.length ? Math.round((learnedCount / tickets.length) * 100) : 0;
  const dailyGoal = Math.max(1, Number(profile.dailyGoal) || 10);
  const todayProgress = profile.dailyHistory?.[getTodayKey()] || { reviews: 0, correct: 0, wrong: 0, xp: 0 };
  const dailyGoalPercent = Math.min(100, Math.round((todayProgress.reviews / dailyGoal) * 100));
  const prompt = currentTicket
    ? settings.direction === "it-ru" ? currentTicket.questions[0] : currentTicket.answers[0].split("/")[0].trim()
    : "";
  const expectedAnswer = currentTicket
    ? settings.direction === "it-ru" ? currentTicket.answers[0] : currentTicket.questions[0]
    : "";
  const choiceOptions = useMemo(
    () => buildChoiceOptions(currentTicket, tickets, settings.direction),
    [currentTicket, tickets, settings.direction],
  );
  const totalReviews = tickets.reduce((sum, ticket) => sum + (ticket.reviewCount || 0), 0);
  const totalCorrect = tickets.reduce((sum, ticket) => sum + (ticket.correctCount || 0), 0);
  const accuracy = totalReviews ? Math.round((totalCorrect / totalReviews) * 100) : 0;
  const difficultWords = useMemo(
    () => [...tickets]
      .filter((ticket) => (ticket.wrongCount || 0) > 0)
      .sort((first, second) => (second.wrongCount || 0) - (first.wrongCount || 0))
      .slice(0, 6),
    [tickets],
  );

  useEffect(() => {
    if (currentIndex > studyTickets.length - 1) {
      setCurrentIndex(Math.max(studyTickets.length - 1, 0));
    }
  }, [currentIndex, studyTickets.length]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [settings.category, settings.level, settings.queueMode, settings.direction, settings.exerciseMode]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  useEffect(() => {
    if (isInstalled) {
      return undefined;
    }

    const dismissedAt = Number(localStorage.getItem(installDismissedStorageKey) || 0);
    const dismissedRecently = Date.now() - dismissedAt < 3 * 24 * 60 * 60 * 1000;

    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setDeferredInstallPrompt(event);

      if (!dismissedRecently && profile.onboardingCompleted) {
        setShowInstallOffer(true);
      }
    }

    function handleInstalled() {
      setIsInstalled(true);
      setShowInstallOffer(false);
      setDeferredInstallPrompt(null);
      localStorage.removeItem(installDismissedStorageKey);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    const offerTimer = profile.onboardingCompleted && !dismissedRecently && (isIOSDevice || isAndroidDevice)
      ? window.setTimeout(() => setShowInstallOffer(true), 1400)
      : null;

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);

      if (offerTimer) {
        window.clearTimeout(offerTimer);
      }
    };
  }, [isInstalled, isIOSDevice, isAndroidDevice, profile.onboardingCompleted]);

  useEffect(() => {
    const progress = tickets.reduce((result, ticket) => {
      result[ticket.id] = {
        status: ticket.status || defaultTicketStatus,
        dueAt: ticket.dueAt || null,
        lastReviewedAt: ticket.lastReviewedAt || null,
        intervalDays: ticket.intervalDays || 0,
        ease: ticket.ease || 2.5,
        correctCount: ticket.correctCount || 0,
        wrongCount: ticket.wrongCount || 0,
        reviewCount: ticket.reviewCount || 0,
      };
      return result;
    }, {});
    const customWords = tickets.filter((ticket) => ticket.source === "custom");

    localStorage.setItem(appDataStorageKey, JSON.stringify({
      version: 2,
      settings,
      profile,
      progress,
      customWords,
    }));
  }, [tickets, settings, profile]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (
      !settings.notifications ||
      !("Notification" in window) ||
      Notification.permission !== "granted" ||
      dueCount === 0
    ) {
      return;
    }

    const reminderKey = `${getTodayKey()}:${dueCount}`;

    if (localStorage.getItem(notificationStorageKey) === reminderKey) {
      return;
    }

    new Notification("Пора повторить итальянские слова", {
      body: `Готово к повторению: ${dueCount}`,
    });
    localStorage.setItem(notificationStorageKey, reminderKey);
  }, [dueCount, settings.notifications]);

  function updateTicketStatus(ticketId, status) {
    setTickets((currentTickets) => {
      return currentTickets.map((ticket) => {
        if (ticket.id !== ticketId) {
          return ticket;
        }

        return applyReview(ticket, status);
      });
    });
    setProfile((currentProfile) => updateDailyProgress(currentProfile, status));
  }

  function goToPreviousTicket() {
    setSlideDirection(-1);
    setCurrentIndex((index) => (index === 0 ? studyTickets.length - 1 : index - 1));
  }

  function goToNextTicket() {
    setSlideDirection(1);
    setCurrentIndex((index) => (index === studyTickets.length - 1 ? 0 : index + 1));
  }

  function pickRandomTicket() {
    const weightedTickets = studyTickets.flatMap((ticket, index) => {
      if (ticket.status === "learned") {
        return [];
      }

      const weight = ticket.status === "unlearned" ? 3 : 1;
      return Array.from({ length: weight }, () => index);
    });

    if (weightedTickets.length === 0) {
      setSlideDirection(1);
      setCurrentIndex((index) => (index + 1) % studyTickets.length);
      return;
    }

    const availableTickets = weightedTickets.filter((index) => index !== currentIndex);
    const pool = availableTickets.length ? availableTickets : weightedTickets;
    const randomIndex = Math.floor(Math.random() * pool.length);
    setSlideDirection(pool[randomIndex] > currentIndex ? 1 : -1);
    setCurrentIndex(pool[randomIndex]);
  }

  function handleSwipe(swipeDirection) {
    if (swipeDirection === "next") {
      goToNextTicket();
    } else {
      goToPreviousTicket();
    }
  }

  function updateSetting(key, value) {
    setSettings((currentSettings) => ({ ...currentSettings, [key]: value }));
  }

  function completeOnboarding(onboardingData) {
    setProfile((currentProfile) => ({ ...currentProfile, ...onboardingData }));
    setSettings((currentSettings) => ({ ...currentSettings, level: "all", category: "all" }));
  }

  async function requestNotifications() {
    if (!("Notification" in window)) {
      setSyncMessage("Уведомления не поддерживаются в этом браузере");
      return;
    }

    const permission = await Notification.requestPermission();
    const enabled = permission === "granted";
    updateSetting("notifications", enabled);

    if (enabled) {
      localStorage.setItem(notificationStorageKey, `${getTodayKey()}:${dueCount}`);
      new Notification("Напоминания включены", {
        body: `Сейчас готово к повторению: ${dueCount}`,
      });
    }
  }

  function dismissInstallOffer() {
    setShowInstallOffer(false);
    localStorage.setItem(installDismissedStorageKey, String(Date.now()));
  }

  async function installApp() {
    if (!deferredInstallPrompt) {
      setShowInstallOffer(false);
      setActiveModal("install");
      return;
    }

    try {
      await deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      setShowInstallOffer(false);
      setDeferredInstallPrompt(null);

      if (choice.outcome !== "accepted") {
        localStorage.setItem(installDismissedStorageKey, String(Date.now()));
      }
    } catch {
      setShowInstallOffer(false);
      setActiveModal("install");
    }
  }

  function addCustomWord(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const italian = String(formData.get("italian") || "").trim();
    const russian = String(formData.get("russian") || "").trim();

    if (!italian || !russian) {
      return;
    }

    const category = String(formData.get("category") || "Мои слова").trim() || "Мои слова";
    const id = `custom-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
    const customWord = normalizeCustomWord({
      id,
      italian,
      russian,
      category,
      level: formData.get("level"),
    }, tickets.length);

    setTickets((currentTickets) => [...currentTickets, customWord]);
    setSettings((currentSettings) => ({ ...currentSettings, category }));
    setActiveModal(null);
    event.currentTarget.reset();
  }

  function deleteCustomWord(ticketId) {
    setTickets((currentTickets) => currentTickets.filter((ticket) => ticket.id !== ticketId));
  }

  function createBackup() {
    const progress = tickets.reduce((result, ticket) => {
      result[ticket.id] = {
        status: ticket.status,
        dueAt: ticket.dueAt || null,
        lastReviewedAt: ticket.lastReviewedAt || null,
        intervalDays: ticket.intervalDays || 0,
        ease: ticket.ease || 2.5,
        correctCount: ticket.correctCount || 0,
        wrongCount: ticket.wrongCount || 0,
        reviewCount: ticket.reviewCount || 0,
      };
      return result;
    }, {});
    const serialized = serializeSyncData({
      version: 2,
      settings,
      profile,
      progress,
      customWords: tickets.filter((ticket) => ticket.source === "custom"),
    });

    setSyncText(serialized || "");
    setSyncMessage(serialized ? "Резервная копия создана" : "Не удалось создать копию");
  }

  async function copyBackup() {
    if (!syncText) {
      createBackup();
      return;
    }

    try {
      await navigator.clipboard.writeText(syncText);
      setSyncMessage("Код скопирован — вставь его на другом устройстве");
    } catch {
      setSyncMessage("Выдели и скопируй код вручную");
    }
  }

  function importBackup() {
    const imported = parseSyncData(syncText);

    if (!imported || !imported.progress || !imported.profile) {
      setSyncMessage("Код резервной копии не распознан");
      return;
    }

    const baseTickets = loadDefaultState().tickets;
    const customWords = Array.isArray(imported.customWords)
      ? imported.customWords.map(normalizeCustomWord).filter(Boolean)
      : [];
    const restoredTickets = [...baseTickets, ...customWords].map((ticket) => ({
      ...ticket,
      ...(imported.progress[ticket.id] || {}),
      id: ticket.id,
      questions: ticket.questions,
      answers: ticket.answers,
    }));

    setTickets(restoredTickets);
    setProfile({ ...defaultProfile, ...imported.profile, streak: getStreak(imported.profile.dailyHistory) });
    setSettings({ ...defaultSettings, ...(imported.settings || {}) });
    setCurrentIndex(0);
    setSyncMessage("Прогресс восстановлен");
  }

  function toggleTheme() {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  }

  return (
    <main className="page">
      <style>{styles}</style>
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <AnimatePresence>
        {showInstallOffer && !isInstalled && (
          <motion.aside
            className="install-offer"
            role="dialog"
            aria-label="Установить iCards"
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
          >
            <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" />
            <div className="install-offer-copy">
              <strong>Установить iCards?</strong>
              <span>Откроется как обычное приложение и будет работать офлайн.</span>
            </div>
            <div className="install-offer-actions">
              <button className="install-now-button" type="button" onClick={installApp}>
                <Download size={17} />
                {deferredInstallPrompt ? "Установить" : "Как установить"}
              </button>
              <button className="install-later-button" type="button" onClick={dismissInstallOffer}>Позже</button>
            </div>
            <button className="install-offer-close" type="button" onClick={dismissInstallOffer} aria-label="Закрыть предложение установки">
              <X size={17} />
            </button>
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!profile.onboardingCompleted && (
          <Onboarding profile={profile} onComplete={completeOnboarding} />
        )}
      </AnimatePresence>

      <motion.header
        className="header"
        initial={shouldReduceMotion ? false : { opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <div className="brand-block">
          <motion.span
            className="brand-mark"
            initial={shouldReduceMotion ? false : { rotate: -12, scale: 0.8 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 18 }}
          >
            i
          </motion.span>
          <div className="brand-copy">
            <h1>iCards</h1>
            <p className="brand-subtitle">Итальянский язык</p>
            <a href="https://t.me/Alexandr_Madibaev" target="_blank" rel="noreferrer">
              by Alexandr Madibaev
            </a>
          </div>
        </div>

        <div className="header-actions">
          <div className="header-score" title="Серия дней">
            <Flame size={19} />
            <strong>{profile.streak || 0}</strong>
          </div>
          <div className="header-score xp-score" title="Опыт">
            <Sparkles size={18} />
            <strong>{profile.xp || 0} XP</strong>
          </div>
          <button className="header-icon-button" type="button" onClick={() => setActiveModal("add")} aria-label="Добавить слово" title="Добавить слово">
            <Plus size={19} />
          </button>
          <button className="header-icon-button" type="button" onClick={() => setActiveModal("stats")} aria-label="Статистика" title="Статистика">
            <BarChart3 size={19} />
          </button>
          <button className="header-icon-button" type="button" onClick={() => { setActiveModal("sync"); createBackup(); }} aria-label="Резервная копия" title="Перенести прогресс">
            <Cloud size={19} />
          </button>
          <button
            className={settings.notifications ? "header-icon-button active" : "header-icon-button"}
            type="button"
            onClick={requestNotifications}
            aria-label="Напоминания"
            title="Напоминания"
          >
            <Bell size={19} />
          </button>
          <motion.button
            className="theme-button"
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
            whileHover={shouldReduceMotion ? undefined : { y: -2 }}
            whileTap={shouldReduceMotion ? undefined : { y: 2 }}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </motion.button>
          <button
            className="header-icon-button mobile-settings-button"
            type="button"
            onClick={() => setActiveModal("settings")}
            aria-label="Настройки обучения"
          >
            <Settings2 size={20} />
          </button>
        </div>
      </motion.header>

      {tickets.length > 0 && (
        <motion.section
          className="lesson-progress"
          aria-label="Прогресс изучения"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08 }}
        >
          <div className="daily-goal-row">
            <div className="daily-goal-copy">
              <span><Target size={17} /> Цель на сегодня</span>
              <strong>{todayProgress.reviews} / {dailyGoal}</strong>
            </div>
            <div className="daily-goal-track" aria-label={`Дневная цель выполнена на ${dailyGoalPercent}%`}>
              <motion.div animate={{ scaleX: dailyGoalPercent / 100 }} transition={{ type: "spring", stiffness: 90, damping: 18 }} />
            </div>
            <button
              className={settings.queueMode === "due" ? "due-button active" : "due-button"}
              type="button"
              onClick={() => updateSetting("queueMode", settings.queueMode === "due" ? "all" : "due")}
            >
              <CalendarClock size={17} />
              К повторению: {dueCount}
            </button>
          </div>
          <div className="progress-head">
            <div className="progress-title">
              <Sparkles size={18} />
              <span>Твой прогресс</span>
            </div>
            <div className="progress-score">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.strong
                  key={learnedCount}
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 8, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.8 }}
                >
                  {learnedCount}
                </motion.strong>
              </AnimatePresence>
              <span>из {tickets.length} слов · {progressPercent}%</span>
            </div>
          </div>

          <div className="progress-track" aria-hidden="true">
            <motion.div
              className="progress-fill"
              initial={false}
              animate={{ scaleX: learnedCount / tickets.length }}
              transition={{ type: "spring", stiffness: 90, damping: 18 }}
            />
          </div>

          <div className="progress-stats">
            <span className="stat-pill stat-known"><Check size={15} /> Знаю: {learnedCount}</span>
            <span className="stat-pill stat-repeat"><RotateCcw size={15} /> Повторить: {repeatCount}</span>
            <span className="stat-pill stat-new"><Sparkles size={15} /> Осталось: {unlearnedCount}</span>
          </div>
        </motion.section>
      )}

      {tickets.length > 0 && (
        <section className="mobile-session-bar" aria-label="Прогресс на сегодня">
          <div className="mobile-session-top">
            <div className="mobile-goal-copy">
              <Target size={17} />
              <span>{profile.name ? `Ciao, ${profile.name}` : "Сегодня"}</span>
              <strong>{todayProgress.reviews}/{dailyGoal}</strong>
            </div>
            <div className="mobile-session-stats">
              <span><Flame size={16} /> {profile.streak || 0}</span>
              <span><Sparkles size={15} /> {profile.xp || 0} XP</span>
              <span><CalendarClock size={15} /> {dueCount}</span>
            </div>
          </div>
          <div className="mobile-goal-track" aria-hidden="true">
            <motion.div animate={{ scaleX: dailyGoalPercent / 100 }} />
          </div>
        </section>
      )}

      {tickets.length > 0 && (
        <motion.section
          className="study-controls"
          aria-label="Настройки упражнения"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <label className="control-select">
            <span>Категория</span>
            <select value={settings.category} onChange={(event) => updateSetting("category", event.target.value)}>
              <option value="all">Все темы</option>
              {categories.map((category) => <option value={category} key={category}>{category}</option>)}
            </select>
          </label>
          <label className="control-select level-select">
            <span>Уровень</span>
            <select value={settings.level} onChange={(event) => updateSetting("level", event.target.value)}>
              <option value="all">Все</option>
              <option value="A1">A1</option>
              <option value="A2">A2</option>
              <option value="B1">B1</option>
            </select>
          </label>
          <div className="segmented-control" aria-label="Направление перевода">
            <span><Languages size={15} /> Направление</span>
            <div>
              <button className={settings.direction === "it-ru" ? "active" : ""} type="button" onClick={() => updateSetting("direction", "it-ru")}>IT → RU</button>
              <button className={settings.direction === "ru-it" ? "active" : ""} type="button" onClick={() => updateSetting("direction", "ru-it")}>RU → IT</button>
            </div>
          </div>
          <div className="segmented-control exercise-control" aria-label="Тип упражнения">
            <span><ListChecks size={15} /> Упражнение</span>
            <div>
              <button className={settings.exerciseMode === "typing" ? "active" : ""} type="button" onClick={() => updateSetting("exerciseMode", "typing")}>Ввод</button>
              <button className={settings.exerciseMode === "choice" ? "active" : ""} type="button" onClick={() => updateSetting("exerciseMode", "choice")}>Выбор</button>
              <button className={settings.exerciseMode === "speaking" ? "active" : ""} type="button" onClick={() => updateSetting("exerciseMode", "speaking")}>Голос</button>
            </div>
          </div>
        </motion.section>
      )}

      {currentTicket ? (
        <section className="study-layout" aria-label="Карточка итальянских слов">
          <div className="study-topline">
            <div className="word-counter">
              <span>{currentTicket.categoryEmoji} {currentTicket.category} · {currentTicket.level}</span>
              <strong>{currentIndex + 1} из {studyTickets.length}</strong>
            </div>
            <motion.button
              className="random-button"
              type="button"
              onClick={pickRandomTicket}
              whileHover={shouldReduceMotion ? undefined : { y: -2 }}
              whileTap={shouldReduceMotion ? undefined : { y: 2 }}
            >
              <Shuffle size={18} />
              Случайное слово
            </motion.button>
          </div>

          <div className="study-stage">
            <motion.button
              className="nav-button"
              type="button"
              onClick={goToPreviousTicket}
              aria-label="Предыдущее слово"
              whileHover={shouldReduceMotion ? undefined : { x: -3, scale: 1.04 }}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.94 }}
            >
              <ChevronLeft size={28} />
            </motion.button>

            <div className="card-viewport">
              <AnimatePresence initial={false} mode="wait" custom={slideDirection}>
                <motion.div
                  className="card-slide"
                  key={`${currentTicket.id}-${settings.direction}-${settings.exerciseMode}`}
                  custom={slideDirection}
                  variants={cardSwapVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: shouldReduceMotion ? 0.01 : 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Card
                    ticket={currentTicket}
                    prompt={prompt}
                    expectedAnswer={expectedAnswer}
                    direction={settings.direction}
                    exerciseMode={settings.exerciseMode}
                    choiceOptions={choiceOptions}
                    onStatusChange={updateTicketStatus}
                    onAdvance={settings.queueMode === "due" ? () => setSlideDirection(1) : goToNextTicket}
                    onSwipe={handleSwipe}
                  />
                </motion.div>
              </AnimatePresence>
            </div>

            <motion.button
              className="nav-button"
              type="button"
              onClick={goToNextTicket}
              aria-label="Следующее слово"
              whileHover={shouldReduceMotion ? undefined : { x: 3, scale: 1.04 }}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.94 }}
            >
              <ChevronRight size={28} />
            </motion.button>
          </div>

          <p className="swipe-hint">← Листай свайпом или стрелками →</p>
        </section>
      ) : (
        <section className="empty">
          <h2>{tickets.length ? "На сегодня всё готово!" : "Пока нет слов"}</h2>
          <p>{tickets.length ? "В выбранной очереди нет слов. Можно открыть все слова или выбрать другую тему." : "Добавьте итальянские слова и их переводы."}</p>
          {tickets.length > 0 && (
            <button className="empty-action" type="button" onClick={() => setSettings((current) => ({ ...current, queueMode: "all", category: "all", level: "all" }))}>
              Показать все слова
            </button>
          )}
        </section>
      )}

      <AnimatePresence>
        {activeModal === "install" && (
          <Modal title="Установка iCards" icon={Smartphone} onClose={() => setActiveModal(null)}>
            <div className="install-guide">
              <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="Иконка iCards" />
              <div className="install-guide-intro">
                <strong>{isIOSDevice ? "Добавь приложение через Safari" : "Добавь приложение на главный экран"}</strong>
                <span>После установки iCards запускается без панели браузера и сохраняет прогресс на устройстве.</span>
              </div>
              <ol>
                {isIOSDevice ? (
                  <>
                    <li><span><Share2 size={19} /></span><div><strong>Нажми «Поделиться»</strong><small>Кнопка находится в панели Safari.</small></div></li>
                    <li><span><Plus size={19} /></span><div><strong>Выбери «На экран Домой»</strong><small>При необходимости прокрути список действий.</small></div></li>
                    <li><span><Check size={19} /></span><div><strong>Нажми «Добавить»</strong><small>Иконка iCards появится среди приложений.</small></div></li>
                  </>
                ) : (
                  <>
                    <li><span><Settings2 size={19} /></span><div><strong>Открой меню браузера</strong><small>Нажми ⋮ в правом верхнем углу Chrome.</small></div></li>
                    <li><span><Download size={19} /></span><div><strong>Выбери «Установить приложение»</strong><small>Иногда пункт называется «Добавить на главный экран».</small></div></li>
                    <li><span><Check size={19} /></span><div><strong>Подтверди установку</strong><small>iCards появится на главном экране.</small></div></li>
                  </>
                )}
              </ol>
              <button className="modal-primary-button install-guide-done" type="button" onClick={() => setActiveModal(null)}>
                Понятно
              </button>
            </div>
          </Modal>
        )}

        {activeModal === "settings" && (
          <Modal title="Настройки обучения" icon={Settings2} onClose={() => setActiveModal(null)}>
            <div className="mobile-settings-sheet">
              {!isInstalled && (
                <button className="sheet-toggle install-sheet-toggle" type="button" onClick={installApp}>
                  <Download size={19} />
                  <span><strong>Установить iCards</strong><small>Добавить приложение на главный экран</small></span>
                  <em>Установить</em>
                </button>
              )}
              <label className="sheet-field">
                <span>Категория</span>
                <select value={settings.category} onChange={(event) => updateSetting("category", event.target.value)}>
                  <option value="all">Все темы</option>
                  {categories.map((category) => <option value={category} key={category}>{category}</option>)}
                </select>
              </label>
              <label className="sheet-field">
                <span>Уровень</span>
                <select value={settings.level} onChange={(event) => updateSetting("level", event.target.value)}>
                  <option value="all">Все уровни</option>
                  <option value="A1">A1</option>
                  <option value="A2">A2</option>
                  <option value="B1">B1</option>
                </select>
              </label>
              <div className="sheet-control">
                <span>Направление</span>
                <div>
                  <button className={settings.direction === "it-ru" ? "active" : ""} type="button" onClick={() => updateSetting("direction", "it-ru")}>IT → RU</button>
                  <button className={settings.direction === "ru-it" ? "active" : ""} type="button" onClick={() => updateSetting("direction", "ru-it")}>RU → IT</button>
                </div>
              </div>
              <div className="sheet-control">
                <span>Упражнение</span>
                <div className="three-options">
                  <button className={settings.exerciseMode === "typing" ? "active" : ""} type="button" onClick={() => updateSetting("exerciseMode", "typing")}>Ввод</button>
                  <button className={settings.exerciseMode === "choice" ? "active" : ""} type="button" onClick={() => updateSetting("exerciseMode", "choice")}>Выбор</button>
                  <button className={settings.exerciseMode === "speaking" ? "active" : ""} type="button" onClick={() => updateSetting("exerciseMode", "speaking")}>Голос</button>
                </div>
              </div>
              <button
                className={settings.queueMode === "due" ? "sheet-toggle active" : "sheet-toggle"}
                type="button"
                onClick={() => updateSetting("queueMode", settings.queueMode === "due" ? "all" : "due")}
              >
                <CalendarClock size={19} />
                <span><strong>Только повторения</strong><small>Сейчас доступно: {dueCount}</small></span>
                <em>{settings.queueMode === "due" ? "Вкл" : "Выкл"}</em>
              </button>
              <button
                className={settings.notifications ? "sheet-toggle active" : "sheet-toggle"}
                type="button"
                onClick={requestNotifications}
              >
                <Bell size={19} />
                <span><strong>Напоминания</strong><small>Сообщать о словах для повторения</small></span>
                <em>{settings.notifications ? "Вкл" : "Выкл"}</em>
              </button>
              <button className="sheet-toggle" type="button" onClick={toggleTheme}>
                {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
                <span><strong>Тема</strong><small>{theme === "dark" ? "Переключить на светлую" : "Переключить на тёмную"}</small></span>
                <em>{theme === "dark" ? "Тёмная" : "Светлая"}</em>
              </button>
            </div>
          </Modal>
        )}

        {activeModal === "add" && (
          <Modal title="Мои слова" icon={FolderPlus} onClose={() => setActiveModal(null)}>
            <form className="custom-word-form" onSubmit={addCustomWord}>
              <label>
                <span>Итальянское слово</span>
                <input name="italian" required placeholder="andare" autoComplete="off" />
              </label>
              <label>
                <span>Перевод</span>
                <input name="russian" required placeholder="идти / ехать" autoComplete="off" />
              </label>
              <label>
                <span>Категория</span>
                <input name="category" list="category-options" defaultValue="Мои слова" />
                <datalist id="category-options">
                  {categories.map((category) => <option value={category} key={category} />)}
                </datalist>
              </label>
              <label>
                <span>Уровень</span>
                <select name="level" defaultValue="A1">
                  <option value="A1">A1</option>
                  <option value="A2">A2</option>
                  <option value="B1">B1</option>
                </select>
              </label>
              <button className="modal-primary-button" type="submit"><Plus size={18} /> Добавить слово</button>
            </form>

            <div className="custom-word-list">
              <h3>Добавлено тобой: {tickets.filter((ticket) => ticket.source === "custom").length}</h3>
              {tickets.filter((ticket) => ticket.source === "custom").map((ticket) => (
                <div className="custom-word-row" key={ticket.id}>
                  <div><strong>{ticket.questions[0]}</strong><span>{ticket.answers[0]}</span></div>
                  <button type="button" onClick={() => deleteCustomWord(ticket.id)} aria-label={`Удалить ${ticket.questions[0]}`}><X size={17} /></button>
                </div>
              ))}
            </div>
          </Modal>
        )}

        {activeModal === "stats" && (
          <Modal title="Статистика обучения" icon={BarChart3} onClose={() => setActiveModal(null)}>
            <div className="learner-summary">
              <span>{(profile.name || "?").slice(0, 1).toUpperCase()}</span>
              <div><strong>{profile.name || "Ученик"}</strong><small>Определённый уровень: {profile.level || "—"}</small></div>
              <button type="button" onClick={() => { setActiveModal(null); setProfile((current) => ({ ...current, onboardingCompleted: false })); }}>Пройти тест снова</button>
            </div>
            <div className="stats-grid">
              <div><Sparkles size={20} /><strong>{profile.xp || 0}</strong><span>XP</span></div>
              <div><Flame size={20} /><strong>{profile.streak || 0}</strong><span>дней подряд</span></div>
              <div><ListChecks size={20} /><strong>{totalReviews}</strong><span>ответов</span></div>
              <div><Target size={20} /><strong>{accuracy}%</strong><span>точность</span></div>
            </div>

            <label className="goal-setting">
              <span>Ежедневная цель</span>
              <div>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={dailyGoal}
                  onChange={(event) => setProfile((current) => ({ ...current, dailyGoal: Math.max(1, Number(event.target.value) || 1) }))}
                />
                <span>слов в день</span>
              </div>
            </label>

            <div className="difficult-list">
              <h3>Слова с ошибками</h3>
              {difficultWords.length ? difficultWords.map((ticket) => (
                <div key={ticket.id}>
                  <span><strong>{ticket.questions[0]}</strong> — {ticket.answers[0]}</span>
                  <em>{ticket.wrongCount} ошибок</em>
                </div>
              )) : <p>Ошибок пока нет — отличный старт!</p>}
            </div>
          </Modal>
        )}

        {activeModal === "sync" && (
          <Modal title="Перенос прогресса" icon={Cloud} onClose={() => setActiveModal(null)}>
            <p className="sync-description">
              Создай резервный код на одном устройстве, скопируй его и импортируй на другом. Слова, XP, серия и расписание повторений перенесутся вместе.
            </p>
            <textarea
              className="sync-textarea"
              value={syncText}
              onChange={(event) => { setSyncText(event.target.value); setSyncMessage(""); }}
              placeholder="Здесь появится код резервной копии"
              spellCheck="false"
            />
            {syncMessage && <p className="sync-message" role="status">{syncMessage}</p>}
            <div className="sync-actions">
              <button type="button" onClick={createBackup}><Download size={18} /> Создать</button>
              <button type="button" onClick={copyBackup}><Cloud size={18} /> Копировать</button>
              <button className="import-button" type="button" onClick={importBackup}><Upload size={18} /> Импортировать</button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <nav className="mobile-bottom-nav" aria-label="Основная навигация">
        <button type="button" onClick={() => setActiveModal("add")}>
          <Plus size={21} />
          <span>Слово</span>
        </button>
        <button type="button" onClick={() => setActiveModal("stats")}>
          <BarChart3 size={21} />
          <span>Прогресс</span>
        </button>
        <button className="primary" type="button" onClick={() => setActiveModal("settings")}>
          <Settings2 size={22} />
          <span>Режим</span>
        </button>
        <button type="button" onClick={() => { setActiveModal("sync"); createBackup(); }}>
          <Cloud size={21} />
          <span>Перенос</span>
        </button>
      </nav>
    </main>
  );
}

const styles = `
:root {
  --bg: #f7f9f4;
  --panel: #ffffff;
  --panel-soft: #f4f7f1;
  --text: #243047;
  --muted: #7b8794;
  --muted-strong: #52606d;
  --border: #e1e8dd;
  --border-strong: #d4dfcf;
  --primary: #58cc02;
  --primary-hover: #46a302;
  --primary-soft: #e9fbdc;
  --green: #46a302;
  --green-soft: #e9fbdc;
  --blue: #1cb0f6;
  --blue-soft: #e5f7ff;
  --orange: #ff9600;
  --orange-soft: #fff2d9;
  --red: #ff4b4b;
  --red-soft: #ffe6e6;
  --shadow: 0 22px 60px rgba(40, 63, 30, 0.13);
  --soft-shadow: 0 8px 22px rgba(40, 63, 30, 0.07);
  color: var(--text);
  background: var(--bg);
  font-family: "Unbounded", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-weight: 650;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}

:root[data-theme="dark"] {
  --bg: #101713;
  --panel: #1b251e;
  --panel-soft: #152019;
  --text: #f8fafc;
  --muted: #8fa197;
  --muted-strong: #c4d2c8;
  --border: #2d3b31;
  --border-strong: #3d5042;
  --primary: #6ddd18;
  --primary-hover: #7ae52b;
  --primary-soft: #244519;
  --green: #6ddd18;
  --green-soft: #244519;
  --blue: #48c5ff;
  --blue-soft: #173a49;
  --orange: #ffb02e;
  --orange-soft: #4a3616;
  --red: #ff6b6b;
  --red-soft: #4b2427;
  --shadow: 0 24px 70px rgba(0, 0, 0, 0.34);
  --soft-shadow: 0 10px 26px rgba(0, 0, 0, 0.22);
}

* {
  box-sizing: border-box;
}

*,
*::before,
*::after {
  transition:
    background-color 220ms ease,
    border-color 220ms ease,
    color 220ms ease,
    box-shadow 220ms ease,
    opacity 220ms ease;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}

button,
input {
  font: inherit;
}

.page {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 22px;
  background:
    radial-gradient(circle at 8% 8%, rgba(88, 204, 2, 0.09), transparent 28%),
    radial-gradient(circle at 92% 78%, rgba(28, 176, 246, 0.08), transparent 26%),
    var(--bg);
}

.ambient {
  position: fixed;
  z-index: -1;
  width: 260px;
  height: 260px;
  border-radius: 50%;
  opacity: 0.24;
  filter: blur(70px);
  pointer-events: none;
}

.ambient-one {
  top: -90px;
  left: -90px;
  background: var(--primary);
}

.ambient-two {
  right: -100px;
  bottom: -100px;
  background: var(--blue);
}

.header,
.summary,
.lesson-progress,
.study-controls,
.study-layout,
.copy-status,
.empty {
  max-width: 1120px;
  margin-left: auto;
  margin-right: auto;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  min-height: 64px;
  margin-bottom: 16px;
}

.brand-block {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-copy {
  display: grid;
  gap: 3px;
}

.brand-subtitle {
  margin: 0;
  color: var(--primary);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 13px;
  background: var(--primary);
  color: #ffffff;
  font-weight: 900;
  box-shadow: 0 5px 0 var(--primary-hover);
}

.header h1,
.summary p,
.summary span,
.study-topline p,
.study-topline strong,
.empty h2,
.empty p,
.card-side h2,
.content-list p,
.copy-status {
  margin: 0;
}

.header h1 {
  color: var(--text);
  font-size: 28px;
  line-height: 1;
}

.brand-copy a {
  width: fit-content;
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.1;
  text-decoration: none;
}

.brand-copy a:hover {
  color: var(--primary);
}

.theme-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 42px;
  border: 1px solid var(--border-strong);
  border-radius: 13px;
  background: var(--panel);
  color: var(--muted-strong);
  cursor: pointer;
  font-weight: 900;
  padding: 0 14px;
  box-shadow: 0 3px 0 var(--border-strong);
}

.theme-button:hover {
  border-color: var(--primary);
  color: var(--primary);
}

button:focus-visible,
[role="button"]:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--blue) 58%, transparent);
  outline-offset: 3px;
}

.lesson-progress {
  display: grid;
  gap: 11px;
  margin-bottom: 18px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: color-mix(in srgb, var(--panel) 94%, transparent);
  padding: 15px 18px;
  box-shadow: var(--soft-shadow);
  backdrop-filter: blur(14px);
}

.progress-head,
.progress-title,
.progress-score,
.progress-stats,
.stat-pill {
  display: flex;
  align-items: center;
}

.progress-head {
  justify-content: space-between;
  gap: 14px;
}

.progress-title {
  gap: 7px;
  color: var(--primary-hover);
  font-size: 13px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.035em;
}

:root[data-theme="dark"] .progress-title {
  color: var(--primary);
}

.progress-score {
  gap: 5px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 800;
}

.progress-score strong {
  min-width: 22px;
  color: var(--text);
  font-size: 19px;
  text-align: right;
}

.progress-track {
  overflow: hidden;
  height: 12px;
  border-radius: 999px;
  background: var(--border);
  box-shadow: inset 0 2px 3px rgba(0, 0, 0, 0.06);
}

.progress-fill {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--primary), #8ee000);
  box-shadow: 0 0 14px color-mix(in srgb, var(--primary) 45%, transparent);
  transform-origin: left center;
}

.progress-stats {
  gap: 8px;
  flex-wrap: wrap;
}

.stat-pill {
  gap: 5px;
  min-height: 27px;
  border-radius: 999px;
  padding: 4px 9px;
  font-size: 11px;
  font-weight: 900;
}

.stat-known {
  background: var(--primary-soft);
  color: var(--primary-hover);
}

.stat-repeat {
  background: var(--orange-soft);
  color: var(--orange);
}

.stat-new {
  background: var(--blue-soft);
  color: var(--blue);
}

.summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}

.summary div {
  min-height: 78px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  padding: 14px 16px;
  box-shadow: var(--soft-shadow);
}

.summary div:hover {
  transform: translateY(-2px);
}

.summary span {
  display: block;
  color: var(--text);
  font-size: 24px;
  font-weight: 900;
  line-height: 1.1;
}

.summary p {
  margin-top: 6px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 800;
}

.study-layout {
  display: grid;
  gap: 12px;
}

.study-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  color: var(--muted-strong);
  font-size: 15px;
}

.study-topline strong {
  color: var(--text);
  overflow-wrap: anywhere;
}

.word-counter {
  display: grid;
  gap: 2px;
}

.word-counter span {
  color: var(--muted);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.word-counter strong {
  font-size: 16px;
}

.random-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 42px;
  border: 1px solid var(--primary);
  border-radius: 13px;
  background: var(--panel);
  color: var(--primary-hover);
  cursor: pointer;
  flex: 0 0 auto;
  font-weight: 900;
  padding: 0 14px;
  box-shadow: 0 3px 0 color-mix(in srgb, var(--primary) 55%, var(--border));
}

.random-button:hover {
  background: var(--primary-soft);
}

.study-stage {
  display: grid;
  grid-template-columns: 54px minmax(0, 780px) 54px;
  justify-content: center;
  align-items: center;
  gap: 18px;
}

.card-viewport,
.card-slide {
  width: 100%;
  min-width: 0;
}

.nav-button {
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  border: 2px solid var(--border-strong);
  border-radius: 50%;
  background: var(--panel);
  color: var(--primary-hover);
  cursor: pointer;
  box-shadow: var(--soft-shadow);
}

.nav-button:not(:disabled):hover {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.nav-button:not(:disabled):active,
.random-button:active,
.theme-button:active,
.status-chip:active,
.rail-item:active {
  filter: brightness(0.97);
}

.nav-button:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

.study-card {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.card-button {
  position: relative;
  width: 100%;
  height: min(49vh, 460px);
  min-height: 360px;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
  perspective: 1400px;
  text-align: left;
  touch-action: pan-y;
  user-select: none;
}

.card-button:hover .card-side {
  box-shadow: 0 30px 80px rgba(39, 50, 82, 0.18);
}

:root[data-theme="dark"] .card-button:hover .card-side {
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.42);
}

.card-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  will-change: transform;
}

.card-side {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
  border: 2px solid var(--border);
  border-bottom: 7px solid var(--primary);
  border-radius: 24px;
  background: var(--panel);
  padding: 28px 32px 24px;
  box-shadow: var(--shadow);
  backface-visibility: hidden;
}

.card-back {
  border-bottom-color: var(--green);
  transform: rotateY(180deg);
}

.card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.face-label {
  width: fit-content;
  margin-bottom: 0;
  border-radius: 999px;
  background: var(--primary-soft);
  color: var(--primary);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.04em;
  padding: 6px 10px;
  text-transform: uppercase;
}

.sound-button {
  display: grid;
  place-items: center;
  width: 48px;
  height: 44px;
  border: 2px solid color-mix(in srgb, var(--blue) 38%, var(--border));
  border-radius: 14px;
  background: var(--blue-soft);
  color: var(--blue);
  cursor: pointer;
  box-shadow: 0 3px 0 color-mix(in srgb, var(--blue) 28%, var(--border));
}

.card-back .face-label {
  background: var(--green-soft);
  color: var(--green);
}

.card-side h2 {
  color: var(--text);
  font-size: 34px;
  line-height: 1.1;
  overflow-wrap: anywhere;
}

.single-word {
  display: grid;
  place-items: center;
  flex: 1;
  color: var(--text);
  font-size: clamp(44px, 7vw, 78px);
  font-weight: 900;
  line-height: 1.12;
  text-align: center;
  overflow-wrap: anywhere;
}

.single-word.translation {
  color: var(--green);
  font-size: clamp(34px, 6vw, 64px);
}

.flip-hint {
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
  text-align: center;
}

.feedback-burst {
  position: absolute;
  z-index: 5;
  top: 18px;
  right: 18px;
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border: 4px solid var(--panel);
  border-radius: 50%;
  color: #ffffff;
  box-shadow: 0 9px 24px rgba(0, 0, 0, 0.18);
  pointer-events: none;
}

.feedback-learned {
  background: var(--primary);
}

.feedback-repeat {
  background: var(--orange);
}

.feedback-unlearned {
  background: var(--red);
}

.reveal-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  width: 100%;
  min-height: 54px;
  border: 2px solid var(--blue);
  border-radius: 16px;
  background: var(--blue);
  color: #ffffff;
  cursor: pointer;
  font-weight: 900;
  box-shadow: 0 5px 0 #118ac3;
}

.answer-form {
  display: grid;
  gap: 9px;
}

.answer-label {
  color: var(--muted-strong);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.015em;
}

.answer-entry-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 9px;
}

.answer-input {
  width: 100%;
  min-width: 0;
  min-height: 56px;
  border: 2px solid var(--border-strong);
  border-radius: 16px;
  outline: 0;
  background: var(--panel);
  color: var(--text);
  padding: 0 17px;
  box-shadow: 0 4px 0 var(--border-strong);
  font-size: 15px;
  font-weight: 750;
}

.answer-input::placeholder {
  color: var(--muted);
  opacity: 0.72;
}

.answer-input:focus {
  border-color: var(--blue);
  box-shadow: 0 4px 0 color-mix(in srgb, var(--blue) 55%, var(--border));
}

.answer-input.has-error {
  border-color: var(--red);
  box-shadow: 0 4px 0 color-mix(in srgb, var(--red) 58%, var(--border));
}

.check-answer-button,
.continue-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 56px;
  border: 2px solid var(--primary);
  border-radius: 16px;
  background: var(--primary);
  color: #ffffff;
  cursor: pointer;
  padding: 0 20px;
  box-shadow: 0 5px 0 var(--primary-hover);
  font-weight: 900;
}

.check-answer-button:disabled {
  border-color: var(--border-strong);
  background: var(--border);
  color: var(--muted);
  cursor: not-allowed;
  box-shadow: 0 4px 0 var(--border-strong);
}

.skip-answer-button {
  width: fit-content;
  min-height: 28px;
  margin: 0 auto;
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 11px;
  font-weight: 850;
  text-decoration: underline;
  text-decoration-color: transparent;
  text-underline-offset: 3px;
}

.skip-answer-button:hover {
  color: var(--red);
  text-decoration-color: currentColor;
}

.answer-result {
  --result-color: var(--blue);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  min-height: 76px;
  border: 2px solid var(--result-color);
  border-radius: 18px;
  background: color-mix(in srgb, var(--result-color) 10%, var(--panel));
  padding: 11px 12px 11px 15px;
  box-shadow: 0 4px 0 color-mix(in srgb, var(--result-color) 48%, var(--border));
  color: var(--result-color);
}

.answer-result.result-learned {
  --result-color: var(--primary-hover);
}

:root[data-theme="dark"] .answer-result.result-learned {
  --result-color: var(--primary);
}

.answer-result.result-repeat {
  --result-color: var(--orange);
}

.answer-result.result-unlearned {
  --result-color: var(--red);
}

.result-copy {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 11px;
}

.result-icon {
  display: grid;
  place-items: center;
  width: 43px;
  height: 43px;
  flex: 0 0 43px;
  border-radius: 50%;
  background: var(--result-color);
  color: #ffffff;
}

.result-copy div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.result-copy strong {
  font-size: 15px;
}

.result-copy span:last-child {
  color: var(--muted-strong);
  font-size: 11px;
  font-weight: 750;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.continue-button {
  min-height: 48px;
  border-color: var(--result-color);
  background: var(--result-color);
  box-shadow: 0 4px 0 color-mix(in srgb, var(--result-color) 72%, #000000);
  padding: 0 17px;
}

.content-list {
  display: grid;
  gap: 14px;
  margin-top: 28px;
}

.content-list p {
  color: var(--muted-strong);
  font-size: 19px;
  font-weight: 400;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.status-control {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 9px;
}

.status-chip {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 56px;
  min-width: 0;
  border: 2px solid transparent;
  border-radius: 16px;
  background: var(--panel);
  color: var(--muted-strong);
  cursor: pointer;
  font-weight: 900;
  line-height: 1.1;
  padding: 0 36px 0 12px;
  box-shadow: 0 4px 0 var(--border-strong);
}

.status-chip:hover {
  border-color: currentColor;
}

.status-chip:disabled {
  cursor: wait;
  opacity: 0.68;
}

.status-chip kbd {
  position: absolute;
  right: 10px;
  display: grid;
  place-items: center;
  width: 21px;
  height: 21px;
  border: 1px solid currentColor;
  border-radius: 6px;
  opacity: 0.55;
  font: inherit;
  font-size: 10px;
}

.status-chip.status-learned {
  border-color: color-mix(in srgb, var(--primary) 55%, var(--border));
  background: var(--primary-soft);
  color: var(--primary-hover);
}

.status-chip.status-repeat {
  border-color: color-mix(in srgb, var(--orange) 55%, var(--border));
  background: var(--orange-soft);
  color: var(--orange);
}

.status-chip.status-unlearned {
  border-color: color-mix(in srgb, var(--red) 55%, var(--border));
  background: var(--red-soft);
  color: var(--red);
}

.swipe-hint {
  display: none;
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
  text-align: center;
}

.header-actions,
.header-score,
.daily-goal-copy,
.due-button,
.segmented-control span,
.modal-head > div,
.modal-primary-button,
.sync-actions button {
  display: flex;
  align-items: center;
}

.header-actions {
  justify-content: flex-end;
  gap: 8px;
}

.header-score {
  gap: 5px;
  min-height: 42px;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: var(--panel);
  padding: 0 11px;
  color: var(--orange);
  box-shadow: 0 3px 0 var(--border-strong);
  font-size: 12px;
}

.xp-score {
  color: var(--blue);
}

.header-icon-button {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 1px solid var(--border-strong);
  border-radius: 13px;
  background: var(--panel);
  color: var(--muted-strong);
  cursor: pointer;
  box-shadow: 0 3px 0 var(--border-strong);
}

.header-icon-button:hover,
.header-icon-button.active {
  border-color: var(--primary);
  background: var(--primary-soft);
  color: var(--primary-hover);
}

.daily-goal-row {
  display: grid;
  grid-template-columns: auto minmax(140px, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding-bottom: 11px;
  border-bottom: 1px solid var(--border);
}

.daily-goal-copy {
  gap: 10px;
  color: var(--muted-strong);
  font-size: 11px;
}

.daily-goal-copy span {
  display: flex;
  align-items: center;
  gap: 5px;
  font-weight: 900;
}

.daily-goal-copy strong {
  color: var(--text);
  white-space: nowrap;
}

.daily-goal-track {
  overflow: hidden;
  height: 9px;
  border-radius: 999px;
  background: var(--border);
}

.daily-goal-track div {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--orange), #ffc800);
  transform-origin: left;
}

.due-button {
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  border: 1px solid var(--border-strong);
  border-radius: 11px;
  background: var(--panel-soft);
  color: var(--muted-strong);
  cursor: pointer;
  padding: 0 11px;
  font-size: 11px;
  font-weight: 900;
}

.due-button.active {
  border-color: var(--orange);
  background: var(--orange-soft);
  color: var(--orange);
}

.study-controls {
  display: grid;
  grid-template-columns: minmax(150px, 1.25fr) 100px minmax(220px, 1fr) minmax(210px, 1fr);
  gap: 9px;
  margin-bottom: 14px;
  border: 1px solid var(--border);
  border-radius: 17px;
  background: color-mix(in srgb, var(--panel) 94%, transparent);
  padding: 11px;
  box-shadow: var(--soft-shadow);
}

.control-select,
.segmented-control {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.control-select > span,
.segmented-control > span {
  color: var(--muted);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.control-select select,
.custom-word-form input,
.custom-word-form select,
.goal-setting input {
  width: 100%;
  min-width: 0;
  height: 38px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  outline: 0;
  background: var(--panel);
  color: var(--text);
  padding: 0 10px;
  font-size: 11px;
  font-weight: 800;
}

.control-select select:focus,
.custom-word-form input:focus,
.custom-word-form select:focus,
.goal-setting input:focus,
.sync-textarea:focus {
  border-color: var(--blue);
}

.segmented-control > div {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
  padding: 3px;
  border-radius: 11px;
  background: var(--panel-soft);
}

.exercise-control > div {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.segmented-control button {
  min-width: 0;
  height: 32px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 10px;
  font-weight: 900;
}

.segmented-control button.active {
  background: var(--panel);
  color: var(--primary-hover);
  box-shadow: 0 2px 7px rgba(30, 50, 25, 0.1);
}

.answer-entry-row {
  grid-template-columns: minmax(0, 1fr) 56px auto;
}

.voice-answer-button {
  display: grid;
  place-items: center;
  width: 56px;
  min-height: 56px;
  border: 2px solid var(--blue);
  border-radius: 16px;
  background: var(--blue-soft);
  color: var(--blue);
  cursor: pointer;
  box-shadow: 0 4px 0 color-mix(in srgb, var(--blue) 45%, var(--border));
}

.voice-answer-button.listening {
  border-color: var(--red);
  background: var(--red-soft);
  color: var(--red);
  animation: listening-pulse 1s ease-in-out infinite;
}

@keyframes listening-pulse {
  50% { transform: scale(1.06); }
}

.speech-error {
  color: var(--red);
  font-size: 10px;
  font-weight: 800;
  text-align: center;
}

.choice-panel {
  display: grid;
  gap: 9px;
}

.choice-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.choice-button {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 54px;
  border: 2px solid var(--border-strong);
  border-radius: 15px;
  background: var(--panel);
  color: var(--text);
  cursor: pointer;
  padding: 8px 12px;
  box-shadow: 0 4px 0 var(--border-strong);
  font-size: 12px;
  font-weight: 850;
  text-align: left;
}

.choice-button:hover {
  border-color: var(--blue);
  background: var(--blue-soft);
}

.choice-button > span {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  border-radius: 8px;
  background: var(--panel-soft);
  color: var(--muted);
  font-size: 10px;
}

.modal-backdrop {
  position: fixed;
  z-index: 100;
  inset: 0;
  display: grid;
  place-items: center;
  overflow-y: auto;
  background: rgba(15, 24, 18, 0.58);
  padding: 20px;
  backdrop-filter: blur(8px);
}

.modal-panel {
  width: min(100%, 650px);
  max-height: min(88dvh, 780px);
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 22px;
  background: var(--panel);
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.3);
}

.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--border);
  padding: 16px 18px;
}

.modal-head > div {
  gap: 9px;
  color: var(--primary-hover);
}

.modal-head h2 {
  margin: 0;
  color: var(--text);
  font-size: 18px;
}

.modal-close {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--border);
  border-radius: 11px;
  background: var(--panel-soft);
  color: var(--muted);
  cursor: pointer;
}

.modal-body {
  overflow-y: auto;
  max-height: calc(min(88dvh, 780px) - 72px);
  padding: 18px;
}

.custom-word-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.custom-word-form label {
  display: grid;
  gap: 5px;
}

.custom-word-form label > span,
.goal-setting > span {
  color: var(--muted-strong);
  font-size: 10px;
  font-weight: 900;
}

.modal-primary-button {
  justify-content: center;
  gap: 7px;
  grid-column: 1 / -1;
  min-height: 46px;
  border: 0;
  border-radius: 13px;
  background: var(--primary);
  color: #ffffff;
  cursor: pointer;
  box-shadow: 0 4px 0 var(--primary-hover);
  font-weight: 900;
}

.custom-word-list,
.difficult-list {
  display: grid;
  gap: 8px;
  margin-top: 20px;
}

.custom-word-list h3,
.difficult-list h3 {
  margin: 0 0 3px;
  color: var(--text);
  font-size: 13px;
}

.custom-word-row,
.difficult-list > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel-soft);
  padding: 10px 12px;
}

.custom-word-row > div {
  display: grid;
  gap: 2px;
}

.custom-word-row span,
.difficult-list span,
.difficult-list p {
  color: var(--muted-strong);
  font-size: 11px;
}

.custom-word-row button {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 10px;
  background: var(--red-soft);
  color: var(--red);
  cursor: pointer;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 9px;
}

.stats-grid > div {
  display: grid;
  place-items: center;
  gap: 4px;
  min-height: 105px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--panel-soft);
  color: var(--blue);
  text-align: center;
}

.stats-grid strong {
  color: var(--text);
  font-size: 20px;
}

.stats-grid span {
  color: var(--muted);
  font-size: 9px;
}

.goal-setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 15px;
  border: 1px solid var(--border);
  border-radius: 13px;
  padding: 11px 12px;
}

.goal-setting > div {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 10px;
}

.goal-setting input {
  width: 72px;
}

.difficult-list em {
  color: var(--red);
  font-size: 9px;
  white-space: nowrap;
}

.sync-description,
.sync-message {
  margin: 0 0 12px;
  color: var(--muted-strong);
  font-size: 11px;
  line-height: 1.55;
}

.sync-textarea {
  width: 100%;
  min-height: 210px;
  resize: vertical;
  border: 2px solid var(--border-strong);
  border-radius: 13px;
  outline: 0;
  background: var(--panel-soft);
  color: var(--text);
  padding: 12px;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 10px;
}

.sync-message {
  margin: 9px 0 0;
  color: var(--primary-hover);
  font-weight: 900;
}

.sync-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 12px;
}

.sync-actions button,
.empty-action {
  justify-content: center;
  gap: 6px;
  min-height: 43px;
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  background: var(--panel-soft);
  color: var(--muted-strong);
  cursor: pointer;
  font-size: 10px;
  font-weight: 900;
}

.sync-actions .import-button,
.empty-action {
  border-color: var(--primary);
  background: var(--primary);
  color: #ffffff;
}

.empty-action {
  display: inline-flex;
  margin: 16px auto 0;
  padding: 0 16px;
}

.onboarding-backdrop {
  position: fixed;
  z-index: 130;
  inset: 0;
  display: grid;
  place-items: center;
  overflow-y: auto;
  background:
    radial-gradient(circle at 15% 10%, rgba(88, 204, 2, 0.22), transparent 32%),
    radial-gradient(circle at 90% 85%, rgba(28, 176, 246, 0.18), transparent 34%),
    var(--bg);
  padding: 20px;
}

.onboarding-panel {
  width: min(100%, 620px);
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 26px;
  background-color: var(--panel);
  box-shadow: 0 32px 100px rgba(24, 48, 27, 0.22);
}

.onboarding-brand {
  display: flex;
  align-items: center;
  gap: 9px;
  border-bottom: 1px solid var(--border);
  padding: 15px 20px;
  color: var(--text);
  font-size: 18px;
  font-weight: 900;
}

.onboarding-brand img {
  width: 38px;
  height: 38px;
  border-radius: 10px;
}

.onboarding-step {
  display: grid;
  gap: 16px;
  min-height: 460px;
  padding: 34px;
}

.onboarding-kicker {
  color: var(--primary-hover);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.onboarding-step h1,
.onboarding-step p {
  margin: 0;
}

.onboarding-step h1 {
  color: var(--text);
  font-size: clamp(25px, 5vw, 36px);
  line-height: 1.15;
}

.onboarding-step p {
  color: var(--muted-strong);
  font-size: 12px;
  line-height: 1.6;
}

.onboarding-name-field {
  display: grid;
  align-self: center;
  gap: 7px;
}

.onboarding-name-field span {
  color: var(--muted-strong);
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.onboarding-name-field input {
  width: 100%;
  height: 58px;
  border: 2px solid var(--border-strong);
  border-radius: 16px;
  outline: 0;
  background: var(--panel-soft);
  color: var(--text);
  padding: 0 16px;
  font-size: 16px;
  font-weight: 800;
}

.onboarding-name-field input:focus {
  border-color: var(--blue);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--blue) 14%, transparent);
}

.onboarding-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: end;
  gap: 8px;
  width: 100%;
  min-height: 54px;
  border: 2px solid var(--primary);
  border-radius: 16px;
  background: var(--primary);
  color: #ffffff;
  cursor: pointer;
  box-shadow: 0 5px 0 var(--primary-hover);
  font-weight: 900;
}

.onboarding-primary:disabled {
  border-color: var(--border-strong);
  background: var(--border);
  color: var(--muted);
  cursor: not-allowed;
  box-shadow: 0 4px 0 var(--border-strong);
}

.self-level-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}

.self-level-grid button {
  display: grid;
  gap: 4px;
  min-height: 72px;
  border: 2px solid var(--border);
  border-radius: 15px;
  background: var(--panel-soft);
  color: var(--text);
  cursor: pointer;
  padding: 11px 13px;
  text-align: left;
}

.self-level-grid button:last-child {
  grid-column: 1 / -1;
}

.self-level-grid button.selected {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.self-level-grid strong {
  font-size: 13px;
}

.self-level-grid span {
  color: var(--muted);
  font-size: 9px;
  line-height: 1.35;
}

.placement-step {
  align-content: start;
}

.placement-progress-copy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--muted);
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.placement-progress {
  overflow: hidden;
  height: 9px;
  border-radius: 999px;
  background: var(--border);
}

.placement-progress div {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--primary), #8ee000);
  transform-origin: left;
}

.placement-step h1 {
  margin: 10px 0 5px;
  font-size: clamp(20px, 4vw, 27px);
}

.placement-options {
  display: grid;
  gap: 9px;
}

.placement-options button {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 55px;
  border: 2px solid var(--border);
  border-radius: 14px;
  background: var(--panel-soft);
  color: var(--text);
  cursor: pointer;
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 800;
  text-align: left;
}

.placement-options button > span {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  border-radius: 9px;
  background: var(--panel);
  color: var(--muted);
  font-size: 10px;
}

.placement-options button:hover,
.placement-options button.selected {
  border-color: var(--blue);
  background: var(--blue-soft);
}

.placement-options button.correct {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.placement-options button.wrong {
  border-color: var(--red);
  background: var(--red-soft);
}

.onboarding-result {
  place-items: center;
  align-content: center;
  text-align: center;
}

.result-level-badge {
  display: grid;
  place-items: center;
  width: 112px;
  height: 112px;
  border: 8px solid var(--primary-soft);
  border-radius: 50%;
  background: var(--primary);
  color: #ffffff;
  box-shadow: 0 12px 30px color-mix(in srgb, var(--primary) 30%, transparent);
  font-size: 32px;
  font-weight: 900;
}

.onboarding-result .onboarding-primary {
  margin-top: 8px;
}

.learner-summary {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--panel-soft);
  padding: 10px;
}

.learner-summary > span {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: var(--primary);
  color: #ffffff;
  font-size: 18px;
  font-weight: 900;
}

.learner-summary > div {
  display: grid;
  gap: 3px;
}

.learner-summary strong {
  color: var(--text);
  font-size: 12px;
}

.learner-summary small {
  color: var(--muted);
  font-size: 9px;
}

.learner-summary button {
  min-height: 36px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: var(--panel);
  color: var(--muted-strong);
  cursor: pointer;
  padding: 0 10px;
  font-size: 9px;
  font-weight: 900;
}

.install-offer {
  position: fixed;
  z-index: 95;
  right: 22px;
  bottom: 22px;
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  gap: 11px 13px;
  width: min(440px, calc(100vw - 32px));
  border: 1px solid var(--border);
  border-radius: 20px;
  background: color-mix(in srgb, var(--panel) 96%, transparent);
  padding: 15px;
  box-shadow: 0 24px 70px rgba(18, 39, 21, 0.28);
  backdrop-filter: blur(18px);
}

.install-offer > img {
  width: 58px;
  height: 58px;
  border-radius: 15px;
}

.install-offer-copy {
  display: grid;
  align-content: center;
  gap: 4px;
  padding-right: 20px;
}

.install-offer-copy strong {
  color: var(--text);
  font-size: 14px;
}

.install-offer-copy span {
  color: var(--muted-strong);
  font-size: 10px;
  font-weight: 700;
  line-height: 1.45;
}

.install-offer-actions {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.install-offer-actions button {
  min-height: 42px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 10px;
  font-weight: 900;
}

.install-now-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid var(--primary);
  background: var(--primary);
  color: #ffffff;
  box-shadow: 0 4px 0 var(--primary-hover);
}

.install-later-button {
  border: 1px solid var(--border-strong);
  background: var(--panel-soft);
  color: var(--muted-strong);
  padding: 0 15px;
}

.install-offer-close {
  position: absolute;
  top: 9px;
  right: 9px;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.install-guide {
  display: grid;
  gap: 16px;
}

.install-guide > img {
  width: 78px;
  height: 78px;
  margin: 0 auto;
  border-radius: 20px;
}

.install-guide-intro {
  display: grid;
  gap: 5px;
  text-align: center;
}

.install-guide-intro strong {
  color: var(--text);
  font-size: 15px;
}

.install-guide-intro span {
  color: var(--muted-strong);
  font-size: 10px;
  line-height: 1.5;
}

.install-guide ol {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.install-guide li {
  display: flex;
  align-items: center;
  gap: 11px;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: var(--panel-soft);
  padding: 10px;
}

.install-guide li > span {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  border-radius: 12px;
  background: var(--primary-soft);
  color: var(--primary-hover);
}

.install-guide li > div {
  display: grid;
  gap: 2px;
}

.install-guide li strong {
  color: var(--text);
  font-size: 11px;
}

.install-guide li small {
  color: var(--muted);
  font-size: 8px;
  line-height: 1.4;
}

.install-guide-done {
  width: 100%;
}

.install-sheet-toggle {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.install-sheet-toggle > svg,
.install-sheet-toggle em {
  color: var(--primary-hover);
}

.mobile-settings-button,
.mobile-session-bar,
.mobile-bottom-nav {
  display: none;
}

.mobile-settings-sheet {
  display: grid;
  gap: 14px;
}

.sheet-field,
.sheet-control {
  display: grid;
  gap: 6px;
}

.sheet-field > span,
.sheet-control > span {
  color: var(--muted);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.sheet-field select {
  width: 100%;
  height: 48px;
  border: 1px solid var(--border-strong);
  border-radius: 13px;
  outline: 0;
  background: var(--panel-soft);
  color: var(--text);
  padding: 0 12px;
  font-size: 13px;
  font-weight: 850;
}

.sheet-control > div {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
  border-radius: 14px;
  background: var(--panel-soft);
  padding: 4px;
}

.sheet-control > div.three-options {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.sheet-control button {
  min-height: 42px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 11px;
  font-weight: 900;
}

.sheet-control button.active {
  background: var(--panel);
  color: var(--primary-hover);
  box-shadow: var(--soft-shadow);
}

.sheet-toggle {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 60px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--panel-soft);
  color: var(--muted-strong);
  cursor: pointer;
  padding: 9px 11px;
  text-align: left;
}

.sheet-toggle > svg {
  color: var(--blue);
}

.sheet-toggle > span {
  display: grid;
  gap: 2px;
}

.sheet-toggle strong {
  color: var(--text);
  font-size: 11px;
}

.sheet-toggle small {
  color: var(--muted);
  font-size: 8px;
  line-height: 1.35;
}

.sheet-toggle em {
  color: var(--muted);
  font-size: 9px;
  font-style: normal;
  font-weight: 900;
}

.sheet-toggle.active {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.sheet-toggle.active em,
.sheet-toggle.active > svg {
  color: var(--primary-hover);
}

.ticket-rail {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 0 10px;
  scrollbar-width: thin;
}

.rail-item {
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--panel);
  color: var(--muted-strong);
  cursor: pointer;
  font-weight: 900;
}

.rail-item:hover {
  border-color: var(--primary);
  color: var(--primary);
  transform: translateY(-1px);
}

.rail-item.active {
  border-color: var(--primary);
  background: var(--primary);
  color: #ffffff;
}

.rail-item.active:hover {
  color: #ffffff;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}

.empty {
  display: grid;
  place-content: center;
  min-height: 360px;
  border: 1px dashed var(--border-strong);
  border-radius: 8px;
  background: var(--panel);
  color: var(--muted);
  text-align: center;
  padding: 24px;
}

.empty h2 {
  color: var(--text);
}

.empty p {
  margin-top: 8px;
}

@media (max-width: 860px) {
  .page {
    padding: 14px;
    padding-bottom: max(14px, env(safe-area-inset-bottom));
  }

  .header {
    align-items: center;
    flex-direction: row;
    margin-bottom: 14px;
  }

  .theme-button {
    width: auto;
  }

  .lesson-progress {
    margin-bottom: 14px;
    padding: 13px 14px;
  }

  .header-score {
    display: none;
  }

  .study-controls {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .summary {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin-bottom: 14px;
  }

  .summary div {
    min-height: 66px;
    padding: 12px;
  }

  .summary span {
    font-size: 21px;
  }

  .study-stage {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .nav-button {
    display: none;
  }

  .study-topline {
    align-items: center;
    flex-direction: row;
    gap: 10px;
  }

  .random-button {
    width: auto;
    margin-top: 0;
  }

  .card-button {
    height: min(48dvh, 430px);
    min-height: 330px;
  }

  .card-side {
    padding: 22px;
  }

  .card-side h2 {
    font-size: 27px;
  }

  .content-list {
    gap: 12px;
    margin-top: 22px;
  }

  .content-list p {
    font-size: 17px;
  }

  .status-control {
    gap: 6px;
  }

  .status-chip {
    min-height: 54px;
    font-size: 13px;
    padding: 0 30px 0 8px;
  }

  .swipe-hint {
    display: block;
  }
}

@media (max-width: 560px) {
  .page {
    padding: 10px;
  }

  .brand-mark {
    width: 38px;
    height: 38px;
  }

  .header h1 {
    font-size: 24px;
  }

  .brand-copy a {
    display: none;
  }

  .theme-button span {
    display: none;
  }

  .theme-button {
    width: 42px;
    padding: 0;
  }

  .header {
    flex-wrap: wrap;
  }

  .header-actions {
    width: 100%;
    justify-content: space-between;
  }

  .header-icon-button,
  .theme-button {
    flex: 0 0 42px;
  }

  .lesson-progress {
    gap: 9px;
    border-radius: 15px;
    padding: 12px;
  }

  .daily-goal-row {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }

  .daily-goal-track {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .daily-goal-copy {
    justify-content: space-between;
  }

  .due-button {
    padding: 0 8px;
    font-size: 9px;
  }

  .study-controls {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    border-radius: 14px;
    padding: 8px;
  }

  .segmented-control {
    grid-column: 1 / -1;
  }

  .progress-title {
    font-size: 11px;
  }

  .progress-score {
    font-size: 11px;
  }

  .progress-stats {
    flex-wrap: nowrap;
    gap: 5px;
  }

  .stat-pill {
    justify-content: center;
    min-width: 0;
    flex: 1;
    padding: 4px 5px;
    font-size: 9px;
  }

  .stat-pill svg {
    display: none;
  }

  .summary {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .summary div {
    min-height: 58px;
    padding: 10px 6px;
    text-align: center;
  }

  .summary span {
    font-size: 18px;
  }

  .summary p {
    font-size: 10px;
  }

  .card-button {
    height: min(39dvh, 360px);
    min-height: 280px;
  }

  .card-side {
    border-radius: 20px;
    padding: 18px;
  }

  .card-side h2 {
    font-size: 24px;
  }

  .content-list p {
    font-size: 16px;
  }

  .ticket-rail {
    padding-bottom: 6px;
  }

  .random-button {
    width: 44px;
    min-height: 42px;
    padding: 0;
    overflow: hidden;
    color: transparent;
    font-size: 0;
  }

  .random-button svg {
    color: var(--primary-hover);
  }

  .status-control {
    gap: 6px;
  }

  .status-chip {
    min-height: 52px;
    border-radius: 14px;
    padding: 0 6px;
    font-size: 11px;
  }

  .status-chip kbd {
    display: none;
  }

  .status-chip svg {
    width: 17px;
    height: 17px;
  }

  .flip-hint {
    font-size: 10px;
  }

  .answer-form {
    gap: 8px;
  }

  .answer-label {
    font-size: 11px;
  }

  .answer-entry-row {
    grid-template-columns: minmax(0, 1fr) 50px;
    gap: 7px;
  }

  .voice-answer-button {
    width: 50px;
    min-height: 50px;
    border-radius: 14px;
  }

  .check-answer-button {
    grid-column: 1 / -1;
  }

  .answer-input,
  .check-answer-button {
    min-height: 50px;
    border-radius: 14px;
  }

  .answer-input {
    font-size: 16px;
  }

  .check-answer-button {
    width: 100%;
  }

  .skip-answer-button {
    min-height: 25px;
    font-size: 10px;
  }

  .answer-result {
    grid-template-columns: 1fr;
    gap: 9px;
    border-radius: 15px;
    padding: 11px;
  }

  .continue-button {
    width: 100%;
    min-height: 48px;
  }

  .result-copy strong {
    font-size: 14px;
  }

  .modal-backdrop {
    align-items: end;
    padding: 0;
  }

  .modal-panel {
    width: 100%;
    max-height: 92dvh;
    border-radius: 22px 22px 0 0;
  }

  .modal-body {
    max-height: calc(92dvh - 70px);
    padding: 14px;
    padding-bottom: max(18px, env(safe-area-inset-bottom));
  }

  .custom-word-form,
  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sync-actions {
    grid-template-columns: 1fr;
  }

  .page {
    overflow: visible;
    padding: 8px 10px calc(82px + env(safe-area-inset-bottom));
  }

  .header {
    flex-wrap: nowrap;
    min-height: 48px;
    margin-bottom: 8px;
  }

  .brand-block {
    gap: 8px;
  }

  .brand-mark {
    width: 36px;
    height: 36px;
    border-radius: 11px;
  }

  .header h1 {
    font-size: 21px;
  }

  .brand-subtitle {
    font-size: 8px;
  }

  .header-actions {
    width: auto;
    margin-left: auto;
  }

  .header-actions > * {
    display: none;
  }

  .header-actions .mobile-settings-button {
    display: grid;
    width: 40px;
    height: 40px;
    flex: 0 0 40px;
  }

  .lesson-progress,
  .study-controls {
    display: none;
  }

  .mobile-session-bar {
    display: grid;
    gap: 8px;
    margin: 0 auto 9px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: color-mix(in srgb, var(--panel) 94%, transparent);
    padding: 9px 11px;
    box-shadow: var(--soft-shadow);
  }

  .mobile-session-top,
  .mobile-goal-copy,
  .mobile-session-stats,
  .mobile-session-stats span {
    display: flex;
    align-items: center;
  }

  .mobile-session-top {
    justify-content: space-between;
    gap: 10px;
  }

  .mobile-goal-copy {
    gap: 5px;
    color: var(--orange);
    font-size: 10px;
    font-weight: 900;
  }

  .mobile-goal-copy strong {
    color: var(--text);
  }

  .mobile-session-stats {
    gap: 7px;
  }

  .mobile-session-stats span {
    gap: 3px;
    color: var(--muted-strong);
    font-size: 9px;
    font-weight: 900;
  }

  .mobile-session-stats span:first-child {
    color: var(--orange);
  }

  .mobile-session-stats span:nth-child(2) {
    color: var(--blue);
  }

  .mobile-goal-track {
    overflow: hidden;
    height: 7px;
    border-radius: 999px;
    background: var(--border);
  }

  .mobile-goal-track div {
    width: 100%;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--orange), #ffc800);
    transform-origin: left;
  }

  .study-layout {
    gap: 8px;
  }

  .study-topline {
    min-height: 40px;
  }

  .word-counter span {
    max-width: 270px;
    overflow: hidden;
    font-size: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .word-counter strong {
    font-size: 14px;
  }

  .study-stage {
    gap: 7px;
  }

  .card-button {
    height: clamp(270px, 36dvh, 320px);
    min-height: 270px;
  }

  .card-side {
    border-bottom-width: 6px;
    border-radius: 18px;
    padding: 15px;
  }

  .face-label {
    max-width: calc(100% - 52px);
    overflow: hidden;
    font-size: 8px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sound-button {
    width: 42px;
    height: 40px;
    border-radius: 12px;
  }

  .single-word,
  .single-word.translation {
    font-size: clamp(34px, 13vw, 54px);
  }

  .flip-hint {
    font-size: 8px;
  }

  .answer-form,
  .choice-panel {
    gap: 6px;
  }

  .answer-label {
    font-size: 9px;
  }

  .answer-input,
  .voice-answer-button,
  .check-answer-button {
    min-height: 47px;
  }

  .voice-answer-button {
    width: 47px;
  }

  .skip-answer-button {
    min-height: 22px;
    font-size: 8px;
  }

  .choice-grid {
    gap: 6px;
  }

  .choice-button {
    min-height: 46px;
    border-radius: 12px;
    padding: 6px 8px;
    font-size: 10px;
  }

  .swipe-hint {
    display: none;
  }

  .mobile-bottom-nav {
    position: fixed;
    z-index: 80;
    right: 8px;
    bottom: max(8px, env(safe-area-inset-bottom));
    left: 8px;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    min-height: 62px;
    border: 1px solid var(--border);
    border-radius: 19px;
    background: color-mix(in srgb, var(--panel) 94%, transparent);
    padding: 5px;
    box-shadow: 0 14px 38px rgba(22, 39, 25, 0.22);
    backdrop-filter: blur(18px);
    transition: transform 180ms ease, opacity 180ms ease;
  }

  .install-offer {
    right: 8px;
    bottom: calc(78px + env(safe-area-inset-bottom));
    left: 8px;
    grid-template-columns: 50px minmax(0, 1fr);
    width: auto;
    border-radius: 18px;
    padding: 12px;
  }

  .install-offer > img {
    width: 50px;
    height: 50px;
    border-radius: 13px;
  }

  .install-offer-copy strong {
    font-size: 12px;
  }

  .install-offer-copy span {
    font-size: 8px;
  }

  .install-offer-actions button {
    min-height: 40px;
  }

  .mobile-bottom-nav button {
    display: grid;
    place-items: center;
    align-content: center;
    gap: 3px;
    min-width: 0;
    border: 0;
    border-radius: 14px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    font-size: 8px;
    font-weight: 900;
  }

  .mobile-bottom-nav button.primary {
    background: var(--primary-soft);
    color: var(--primary-hover);
  }

  .page:has(.answer-input:focus) .mobile-bottom-nav,
  .page:has(.answer-input:focus) .install-offer {
    opacity: 0;
    pointer-events: none;
    transform: translateY(120%);
  }

  .modal-head {
    padding: 13px 14px;
  }

  .modal-head h2 {
    font-size: 16px;
  }

  .onboarding-backdrop {
    align-items: stretch;
    padding: 0;
  }

  .onboarding-panel {
    width: 100%;
    min-height: 100dvh;
    border: 0;
    border-radius: 0;
  }

  .onboarding-brand {
    min-height: 58px;
    padding: 10px 16px;
  }

  .onboarding-brand img {
    width: 36px;
    height: 36px;
  }

  .onboarding-step {
    min-height: calc(100dvh - 58px);
    overflow-y: auto;
    gap: 14px;
    padding: 24px 18px max(24px, env(safe-area-inset-bottom));
  }

  .onboarding-step h1 {
    font-size: 27px;
  }

  .onboarding-step p {
    font-size: 11px;
  }

  .self-level-grid {
    gap: 7px;
  }

  .self-level-grid button {
    min-height: 67px;
    padding: 9px 10px;
  }

  .placement-step {
    align-content: start;
  }

  .placement-step h1 {
    margin-top: 6px;
    font-size: 21px;
  }

  .placement-options {
    gap: 7px;
  }

  .placement-options button {
    min-height: 52px;
    padding: 7px 10px;
    font-size: 10px;
  }

  .onboarding-result {
    align-content: center;
  }

  .learner-summary {
    grid-template-columns: 44px minmax(0, 1fr);
  }

  .learner-summary > span {
    width: 44px;
    height: 44px;
  }

  .learner-summary button {
    grid-column: 1 / -1;
    width: 100%;
  }
}
`;
