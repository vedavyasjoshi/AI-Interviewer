// Target roles the user can interview for. Each role carries guidance that is
// injected into the LLM prompts so questions and scoring are role-appropriate.

export const ROLES = {
  'software-engineer': {
    id: 'software-engineer',
    label: 'Software Engineer',
    focus:
      'coding fundamentals, data structures & algorithms, system design, ' +
      'debugging, testing, and collaboration on engineering teams',
    competencies: [
      'Technical depth',
      'Problem solving',
      'System design',
      'Code quality',
      'Communication',
    ],
  },
  'product-manager': {
    id: 'product-manager',
    label: 'Product Manager',
    focus:
      'product sense, prioritization, metrics & experimentation, stakeholder ' +
      'management, strategy, and driving execution without direct authority',
    competencies: [
      'Product sense',
      'Prioritization',
      'Analytical thinking',
      'Stakeholder management',
      'Communication',
    ],
  },
  'data-scientist': {
    id: 'data-scientist',
    label: 'Data Scientist',
    focus:
      'statistics & probability, machine learning, experiment design, data ' +
      'wrangling, model evaluation, and translating analysis into business impact',
    competencies: [
      'Statistical rigor',
      'ML/modeling depth',
      'Experiment design',
      'Data intuition',
      'Communication',
    ],
  },
};

// Difficulty levels calibrate how hard questions are and how strictly answers
// are scored. `guidance` is injected into the LLM prompts.
export const DIFFICULTIES = {
  easy: {
    id: 'easy',
    label: 'Easy',
    guidance:
      'Keep questions approachable and foundational. Favor breadth over ' +
      'depth, allow the candidate to warm up, and score generously — reward ' +
      'clear fundamentals. Still calibrate topics to the resume.',
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    guidance:
      'Ask standard interview-level questions that expect solid fundamentals ' +
      'plus real project ownership. Probe one level deeper on weak answers. ' +
      'Score with balanced expectations.',
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    guidance:
      'Push hard on depth, trade-offs, and reasoning under ambiguity. Follow ' +
      'up relentlessly on gaps and expect concrete, quantified impact. Score ' +
      'strictly — expect nuance and first-principles thinking.',
  },
};

const DEFAULT_DIFFICULTY = 'medium';

export function getDifficulty(id) {
  return DIFFICULTIES[id] || DIFFICULTIES[DEFAULT_DIFFICULTY];
}

export function listDifficulties() {
  return Object.values(DIFFICULTIES).map(({ id, label }) => ({ id, label }));
}

export function getRole(roleId) {
  return ROLES[roleId] || null;
}

export function listRoles() {
  return Object.values(ROLES).map(({ id, label, competencies }) => ({
    id,
    label,
    competencies,
  }));
}
