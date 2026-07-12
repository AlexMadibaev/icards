export const wordMetadata = [
  {
    groupIndex: 0,
    category: "Приветствия",
    level: "A1",
    emoji: "👋",
    label: "Первые фразы",
  },
  {
    groupIndex: 1,
    category: "Вежливость",
    level: "A1",
    emoji: "🤝",
    label: "Вежливые слова",
  },
  {
    groupIndex: 2,
    category: "Семья",
    level: "A1",
    emoji: "👨‍👩‍👧‍👦",
    label: "Близкие люди",
  },
  {
    groupIndex: 3,
    category: "Дом",
    level: "A1",
    emoji: "🏠",
    label: "Всё о доме",
  },
  {
    groupIndex: 4,
    category: "Еда",
    level: "A1",
    emoji: "🍞",
    label: "Еда и напитки",
  },
  {
    groupIndex: 5,
    category: "Приёмы пищи",
    level: "A1",
    emoji: "🍽️",
    label: "За столом",
  },
  {
    groupIndex: 6,
    category: "Время",
    level: "A1",
    emoji: "🕐",
    label: "Дни и время",
  },
  {
    groupIndex: 7,
    category: "Дни недели",
    level: "A1",
    emoji: "📅",
    label: "Дни недели",
  },
  {
    groupIndex: 8,
    category: "Числа",
    level: "A1",
    emoji: "🔢",
    label: "Считаем по-итальянски",
  },
  {
    groupIndex: 9,
    category: "Глаголы",
    level: "A2",
    emoji: "🏃",
    label: "Действия и речь",
  },
  {
    groupIndex: 10,
    category: "Прилагательные",
    level: "A2",
    emoji: "🎨",
    label: "Описываем мир",
  },
  {
    groupIndex: 11,
    category: "Путешествия",
    level: "A2",
    emoji: "✈️",
    label: "В дороге",
  },
];

export function getWordMetadata(groupIndex) {
  const index = Number(groupIndex);

  return Number.isInteger(index) ? wordMetadata[index] ?? null : null;
}
