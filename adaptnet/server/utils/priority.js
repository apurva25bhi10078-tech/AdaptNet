// Decides how urgent a request is. Higher score = shown higher on the dashboard.

const BASE_SCORE = { medical: 70, rescue: 60, shelter: 30, food: 25, other: 10 };

// Extra points for vulnerable people or critical supplies
const NEED_BONUS = {
  baby: 15,
  pregnant: 15,
  injured: 15,
  elderly: 10,
  disabled: 10,
  child: 8,
  medicines: 8,
  formula_milk: 5,
  drinking_water: 5,
  diapers: 3,
  blankets: 0,
  sanitary: 0,
};
const NEEDS = Object.keys(NEED_BONUS);

// Words in the message that suggest immediate danger
const DANGER_WORDS = [
  'bleeding', 'unconscious', 'not breathing', 'trapped', 'collapsed',
  'drowning', 'fire', 'chest pain', 'labour', 'labor', 'delivery',
];

function calculatePriority({ type, people_count = 1, special_needs = [], message = '' }) {
  let score = BASE_SCORE[type] ?? 10;

  for (const need of special_needs) score += NEED_BONUS[need] || 0;

  // More people affected = more urgent (capped)
  score += Math.min(Math.max(people_count - 1, 0), 10) * 1.5;

  const text = String(message).toLowerCase();
  const hits = DANGER_WORDS.filter((w) => text.includes(w)).length;
  score += Math.min(hits, 2) * 10;

  score = Math.min(100, Math.round(score));

  let label = 'low';
  if (score >= 85) label = 'critical';
  else if (score >= 65) label = 'high';
  else if (score >= 40) label = 'medium';

  return { score, label };
}

module.exports = { calculatePriority, NEEDS, BASE_SCORE };
