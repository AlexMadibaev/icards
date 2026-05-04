import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Moon, Shuffle, Sun } from "lucide-react";
import defaultAnswersRaw from "./data/answers.txt?raw";
import defaultQuestionsRaw from "./data/questions.txt?raw";

const emptyAnswer = "Ответ не добавлен";
const sharePrefix = "#data=";
const themeStorageKey = "tickets-app-theme";
const statusStorageKey = "tickets-app-statuses";
const defaultTicketStatus = "unlearned";
const ticketStatuses = [
  {
    value: "learned",
    label: "Выучил",
  },
  {
    value: "repeat",
    label: "50/50",
  },
  {
    value: "unlearned",
    label: "Не выучил",
  },
];

function encodeState(state) {
  const json = JSON.stringify(state);
  return btoa(unescape(encodeURIComponent(json)));
}

function decodeState(value) {
  try {
    const json = decodeURIComponent(escape(atob(value)));
    const parsed = JSON.parse(json);

    return {
      tickets: Array.isArray(parsed.tickets) ? parsed.tickets : [],
      answerTickets: Array.isArray(parsed.answerTickets) ? parsed.answerTickets : [],
    };
  } catch {
    return {
      tickets: [],
      answerTickets: [],
    };
  }
}

function loadSharedState() {
  const state = window.location.hash.startsWith(sharePrefix)
    ? decodeState(window.location.hash.slice(sharePrefix.length))
    : loadDefaultState();

  return {
    ...state,
    tickets: applySavedStatuses(state.tickets),
  };
}

function loadDefaultState() {
  const answerTickets = parseAnswers(defaultAnswersRaw);
  const tickets = mergeTicketsWithAnswers(parseTickets(defaultQuestionsRaw), answerTickets);

  return {
    tickets,
    answerTickets,
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

function parseNumberedItems(block) {
  const items = [];
  let current = null;

  block.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed || /^Билет\s*№?\s*\d+/i.test(trimmed) || isJunkLine(trimmed)) {
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
  const blocks = text.split(/(?=Билет\s*№?\s*\d+)/gi);

  return blocks
    .map((block, i) => {
      const title = block.match(/Билет\s*№?\s*\d+/i)?.[0] || `Билет ${i + 1}`;
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

function Card({ ticket, onStatusChange }) {
  const [flip, setFlip] = useState(false);

  return (
    <article className={`study-card status-${ticket.status || defaultTicketStatus}`}>
      <button className="card-button" type="button" onClick={() => setFlip(!flip)}>
        <motion.div
          className="card-inner"
          animate={{ rotateY: flip ? 180 : 0 }}
          transition={{ duration: 0.55, ease: "easeInOut" }}
        >
          <div className="card-side">
            <span className="face-label">Вопросы</span>
            <h2>{ticket.title}</h2>
            <div className="content-list">
              {ticket.questions.map((question, i) => (
                <p key={i}>
                  {i + 1}. {question}
                </p>
              ))}
            </div>
          </div>

          <div className="card-side card-back">
            <span className="face-label">Ответы</span>
            <h2>{ticket.title}</h2>
            <div className="content-list">
              {ticket.answers.map((answer, i) => (
                <p key={i}>
                  {i + 1}. {answer}
                </p>
              ))}
            </div>
          </div>
        </motion.div>
      </button>

      <div className="status-control" aria-label={`Статус ${ticket.title}`}>
        {ticketStatuses.map((status) => (
          <button
            className={ticket.status === status.value ? "status-chip active" : "status-chip"}
            key={status.value}
            type="button"
            onClick={() => onStatusChange(ticket.id, status.value)}
          >
            {status.label}
          </button>
        ))}
      </div>
    </article>
  );
}

export default function App() {
  const [initialState] = useState(() => loadSharedState());
  const [tickets, setTickets] = useState(initialState.tickets);
  const [answerTickets, setAnswerTickets] = useState(initialState.answerTickets);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [theme, setTheme] = useState(() => localStorage.getItem(themeStorageKey) || "light");

  const currentTicket = tickets[currentIndex] || tickets[0];
  const learnedCount = tickets.filter((ticket) => ticket.status === "learned").length;
  const repeatCount = tickets.filter((ticket) => ticket.status === "repeat").length;
  const unlearnedCount = tickets.filter((ticket) => ticket.status === "unlearned").length;

  useEffect(() => {
    if (currentIndex > tickets.length - 1) {
      setCurrentIndex(Math.max(tickets.length - 1, 0));
    }
  }, [currentIndex, tickets.length]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  useEffect(() => {
    const statuses = tickets.reduce((result, ticket) => {
      result[getTicketKey(ticket)] = ticket.status || defaultTicketStatus;
      return result;
    }, {});

    localStorage.setItem(statusStorageKey, JSON.stringify(statuses));
  }, [tickets]);

  useEffect(() => {
    if (
      !window.location.hash.startsWith(sharePrefix) ||
      (tickets.length === 0 && answerTickets.length === 0)
    ) {
      return;
    }

    const encoded = encodeState({ tickets, answerTickets });
    window.history.replaceState(null, "", `${window.location.pathname}${sharePrefix}${encoded}`);
  }, [tickets, answerTickets]);

  function updateTicketStatus(ticketId, status) {
    setTickets((currentTickets) => {
      return currentTickets.map((ticket) => {
        if (ticket.id !== ticketId) {
          return ticket;
        }

        return {
          ...ticket,
          status,
        };
      });
    });
  }

  function goToPreviousTicket() {
    setCurrentIndex((index) => Math.max(index - 1, 0));
  }

  function goToNextTicket() {
    setCurrentIndex((index) => Math.min(index + 1, tickets.length - 1));
  }

  function pickRandomTicket() {
    const weightedTickets = tickets.flatMap((ticket, index) => {
      if (ticket.status === "learned") {
        return [];
      }

      const weight = ticket.status === "unlearned" ? 3 : 1;
      return Array.from({ length: weight }, () => index);
    });

    if (weightedTickets.length === 0) {
      return;
    }

    const randomIndex = Math.floor(Math.random() * weightedTickets.length);
    setCurrentIndex(weightedTickets[randomIndex]);
  }

  function toggleTheme() {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  }

  return (
    <main className="page">
      <style>{styles}</style>

      <header className="header">
        <div className="brand-block">
          <span className="brand-mark">i</span>
          <div className="brand-copy">
            <h1>iCards</h1>
            <a href="https://t.me/Alexandr_Madibaev" target="_blank" rel="noreferrer">
              by Alexandr Madibaev
            </a>
          </div>
        </div>

        <button className="theme-button" type="button" onClick={toggleTheme}>
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          {theme === "dark" ? "Светлая" : "Ночная"}
        </button>
      </header>

      {tickets.length > 0 && (
        <section className="summary" aria-label="Прогресс">
          <div>
            <span>{tickets.length}</span>
            <p>Всего</p>
          </div>
          <div>
            <span>{learnedCount}</span>
            <p>Выучил</p>
          </div>
          <div>
            <span>{repeatCount}</span>
            <p>50/50</p>
          </div>
          <div>
            <span>{unlearnedCount}</span>
            <p>Не выучил</p>
          </div>
        </section>
      )}

      {currentTicket ? (
        <section className="study-layout" aria-label="Карточка билета">
          <div className="study-topline">
            <p>{currentIndex + 1} / {tickets.length}</p>
            <strong>{currentTicket.title}</strong>
            <button className="random-button" type="button" onClick={pickRandomTicket}>
              <Shuffle size={18} />
              Случайный билет
            </button>
          </div>

          <div className="study-stage">
            <button
              className="nav-button"
              type="button"
              onClick={goToPreviousTicket}
              disabled={currentIndex === 0}
              aria-label="Предыдущий билет"
            >
              <ChevronLeft size={28} />
            </button>

            <Card ticket={currentTicket} onStatusChange={updateTicketStatus} />

            <button
              className="nav-button"
              type="button"
              onClick={goToNextTicket}
              disabled={currentIndex === tickets.length - 1}
              aria-label="Следующий билет"
            >
              <ChevronRight size={28} />
            </button>
          </div>

          <div className="ticket-rail" aria-label="Все билеты">
            {tickets.map((ticket, index) => (
              <button
                className={index === currentIndex ? "rail-item active" : "rail-item"}
                key={ticket.id}
                type="button"
                onClick={() => setCurrentIndex(index)}
              >
                {ticket.number || index + 1}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="empty">
          <h2>Пока нет билетов</h2>
          <p>Формат файлов: `Билет №1`, затем строки `1. Вопрос` или `1. Ответ`.</p>
        </section>
      )}
    </main>
  );
}

const styles = `
:root {
  --bg: #f6f7fb;
  --panel: #ffffff;
  --panel-soft: #f8fafc;
  --text: #111827;
  --muted: #64748b;
  --muted-strong: #586380;
  --border: #e2e6f0;
  --border-strong: #d8dce8;
  --primary: #4255ff;
  --primary-hover: #3347e6;
  --primary-soft: #edefff;
  --green: #0f766e;
  --green-soft: #dff7ef;
  --shadow: 0 24px 70px rgba(39, 50, 82, 0.14);
  --soft-shadow: 0 10px 26px rgba(39, 50, 82, 0.06);
  color: var(--text);
  background: var(--bg);
  font-family: "Unbounded", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-weight: 650;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}

:root[data-theme="dark"] {
  --bg: #0f172a;
  --panel: #1e293b;
  --panel-soft: #162033;
  --text: #f8fafc;
  --muted: #94a3b8;
  --muted-strong: #cbd5e1;
  --border: #334155;
  --border-strong: #475569;
  --primary: #7c8cff;
  --primary-hover: #93a0ff;
  --primary-soft: #25305f;
  --green: #34d399;
  --green-soft: #123b35;
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
    opacity 220ms ease,
    transform 220ms ease;
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
  min-height: 100vh;
  padding: 22px;
  background: var(--bg);
}

.header,
.summary,
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
  margin-bottom: 18px;
}

.brand-block {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-copy {
  display: grid;
  gap: 5px;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 8px;
  background: var(--primary);
  color: #ffffff;
  font-weight: 900;
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
  border-radius: 8px;
  background: var(--panel);
  color: var(--muted-strong);
  cursor: pointer;
  font-weight: 900;
  padding: 0 14px;
}

.theme-button:hover {
  border-color: var(--primary);
  color: var(--primary);
  transform: translateY(-1px);
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
  gap: 16px;
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

.random-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 42px;
  border: 1px solid var(--primary);
  border-radius: 8px;
  background: var(--primary);
  color: #ffffff;
  cursor: pointer;
  flex: 0 0 auto;
  font-weight: 900;
  padding: 0 14px;
}

.random-button:hover {
  background: var(--primary-hover);
  transform: translateY(-1px);
}

.study-stage {
  display: grid;
  grid-template-columns: 54px minmax(0, 780px) 54px;
  justify-content: center;
  align-items: center;
  gap: 18px;
}

.nav-button {
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  border: 1px solid var(--border-strong);
  border-radius: 50%;
  background: var(--panel);
  color: var(--primary);
  cursor: pointer;
  box-shadow: var(--soft-shadow);
}

.nav-button:not(:disabled):hover {
  border-color: var(--primary);
  transform: translateY(-1px) scale(1.03);
}

.nav-button:not(:disabled):active,
.random-button:active,
.theme-button:active,
.status-chip:active,
.rail-item:active {
  transform: scale(0.97);
}

.nav-button:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

.study-card {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.card-button {
  width: 100%;
  height: min(56vh, 500px);
  min-height: 430px;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
  perspective: 1400px;
  text-align: left;
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
  border: 1px solid var(--border);
  border-bottom: 5px solid var(--primary);
  border-radius: 8px;
  background: var(--panel);
  padding: 34px;
  box-shadow: var(--shadow);
  backface-visibility: hidden;
}

.card-back {
  border-bottom-color: var(--green);
  transform: rotateY(180deg);
}

.face-label {
  width: fit-content;
  margin-bottom: 16px;
  border-radius: 999px;
  background: var(--primary-soft);
  color: var(--primary);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.04em;
  padding: 6px 10px;
  text-transform: uppercase;
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
  gap: 8px;
}

.status-chip {
  min-height: 44px;
  min-width: 0;
  border: 2px solid transparent;
  border-radius: 8px;
  background: var(--panel);
  color: var(--muted-strong);
  cursor: pointer;
  font-weight: 900;
  line-height: 1.1;
  padding: 0 12px;
  box-shadow: var(--soft-shadow);
}

.status-chip:hover {
  border-color: var(--border-strong);
  transform: translateY(-1px);
}

.status-chip.active {
  color: #ffffff;
}

.status-learned .status-chip.active {
  background: #16a34a;
}

.status-repeat .status-chip.active {
  background: #d97706;
}

.status-unlearned .status-chip.active {
  background: #dc2626;
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
  }

  .header {
    align-items: stretch;
    flex-direction: column;
    margin-bottom: 14px;
  }

  .theme-button {
    width: 100%;
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
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }

  .random-button {
    width: 100%;
    margin-top: 8px;
  }

  .card-button {
    height: min(54vh, 460px);
    min-height: 350px;
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
    min-height: 42px;
    font-size: 13px;
    padding: 0 8px;
  }
}

@media (max-width: 430px) {
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
    font-size: 11px;
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
    height: min(55vh, 430px);
    min-height: 330px;
  }

  .card-side {
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
}
`;
