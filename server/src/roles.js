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
