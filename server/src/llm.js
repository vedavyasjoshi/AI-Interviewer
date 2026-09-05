// LLM integration (OpenAI-compatible chat completions) with a deterministic
// mock fallback so the app is fully demoable without any API key.

// OpenAI-compatible LLM providers, tried in order. All speak the same
// /chat/completions protocol (Magica, OpenAI, Groq).
//
// Primary: Magica (MAGICA_* vars) — large token budget, no daily cap.
// Fallback: Groq/OpenAI (OPENAI_* vars) — used automatically if the primary
// call fails (auth, rate limit, network). If neither is configured, callers
// degrade to the deterministic mock.
const PROVIDERS = [
  {
    name: 'magica',
    apiKey: process.env.MAGICA_API_KEY,
    baseUrl: process.env.MAGICA_BASE_URL || 'https://inference.magica.com/v1',
    model: process.env.MAGICA_MODEL || 'openai/gpt-4o-mini',
  },
  {
    name: 'groq',
    apiKey: process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY,
    baseUrl:
      process.env.GROQ_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      'https://api.groq.com/openai/v1',
    model: process.env.GROQ_MODEL || process.env.OPENAI_MODEL || 'openai/gpt-oss-120b',
  },
].filter((p) => p.apiKey);

export const llmConfigured = PROVIDERS.length > 0;

// The model that will actually be used (first configured provider), for
// display in the UI. Null when running in mock mode.
export const llmModel = PROVIDERS[0]?.model || null;

/**
 * Single request to one provider. Returns the assistant content string.
 */
async function callProvider(provider, messages, { json, temperature }) {
  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      temperature,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`LLM request failed (${res.status}): ${detail}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

/**
 * Low-level chat call. Tries each configured provider in order, falling back
 * to the next on failure. Throws only if every provider fails (callers then
 * degrade to the mock). `json = true` asks the model for a JSON response.
 */
async function chat(messages, { json = false, temperature = 0.7 } = {}) {
  let lastErr;
  for (const provider of PROVIDERS) {
    try {
      return await callProvider(provider, messages, { json, temperature });
    } catch (err) {
      lastErr = err;
      console.error(`LLM provider "${provider.name}" failed: ${err.message}`);
      // Try the next provider.
    }
  }
  throw lastErr || new Error('No LLM providers configured');
}

// Robustly parse a JSON object from model output. Some OpenAI-compatible
// providers (e.g. Magica) don't honor response_format, so the model may wrap
// the JSON in prose or ```json fences. Strip fences and extract the first
// balanced {...} block before parsing. Throws if no valid JSON is found.
function parseJsonObject(content) {
  const text = String(content).trim();
  // Fast path: already clean JSON.
  try {
    return JSON.parse(text);
  } catch {
    /* fall through to extraction */
  }
  // Strip ```json ... ``` or ``` ... ``` fences.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  try {
    return JSON.parse(candidate);
  } catch {
    /* fall through to brace extraction */
  }
  // Extract the first balanced top-level object.
  const start = candidate.indexOf('{');
  if (start !== -1) {
    let depth = 0;
    for (let i = start; i < candidate.length; i++) {
      const c = candidate[i];
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          return JSON.parse(candidate.slice(start, i + 1));
        }
      }
    }
  }
  throw new Error('No JSON object found in model output');
}

// Returns a sentence to append to a system prompt describing the target
// difficulty. Empty string when no difficulty is provided.
function difficultyLine(difficulty) {
  if (!difficulty || !difficulty.guidance) return '';
  return ` Difficulty — ${difficulty.label}: ${difficulty.guidance}`;
}

function resumeContext(resume, role) {
  const skills = (resume.skills || []).join(', ') || 'none listed';
  const experience = (resume.experience || []).slice(0, 6).join('\n- ');
  const projects = (resume.projects || []).slice(0, 4).join('\n- ');
  const education = (resume.education || []).slice(0, 3).join('\n- ');
  return [
    `Candidate: ${resume.name || 'Unknown'}`,
    `Target role: ${role.label}`,
    `Role focus areas: ${role.focus}`,
    `Summary: ${resume.summary || 'n/a'}`,
    `Skills: ${skills}`,
    experience ? `Experience:\n- ${experience}` : 'Experience: n/a',
    projects ? `Projects:\n- ${projects}` : 'Projects: n/a',
    education ? `Education:\n- ${education}` : 'Education: n/a',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a role profile from free-text user input (a role title, or a longer
 * description / job posting). Returns { id, label, focus, competencies[5] } —
 * the same shape as the built-in roles, so the rest of the pipeline (questions,
 * scoring, radar) works unchanged. Falls back to a heuristic profile offline.
 */
export async function generateRoleProfile(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  if (!llmConfigured) return mockRoleProfile(raw);

  try {
    const content = await chat(
      [
        {
          role: 'system',
          content:
            'You turn a user-provided job role (a short title or a longer ' +
            'description) into an interview profile. Respond ONLY with a JSON ' +
            'object of this shape:\n' +
            '{ "label": string, "focus": string, "competencies": string[] }\n' +
            'label: a clean role title (Title Case, <= 40 chars). ' +
            'focus: one sentence naming the key areas an interview for this ' +
            'role should cover. ' +
            'competencies: EXACTLY 5 concise competency names (2-3 words each) ' +
            'appropriate for this role; the last one should be Communication ' +
            'unless clearly irrelevant.',
        },
        { role: 'user', content: `Role input:\n${raw}\n\nReturn the JSON.` },
      ],
      { json: true, temperature: 0.4 }
    );
    const parsed = parseJsonObject(content);
    const label = String(parsed.label || raw).trim().slice(0, 60);
    let competencies = Array.isArray(parsed.competencies)
      ? parsed.competencies.map((c) => String(c).trim()).filter(Boolean)
      : [];
    // Normalize to exactly 5 for a consistent radar chart.
    if (competencies.length > 5) competencies = competencies.slice(0, 5);
    while (competencies.length < 5) competencies.push('Communication');
    return {
      id: 'custom',
      label,
      focus: String(parsed.focus || `core skills for a ${label}`).trim(),
      competencies,
    };
  } catch (err) {
    console.error('LLM generateRoleProfile failed, using mock:', err.message);
    return mockRoleProfile(raw);
  }
}

// Heuristic role profile when no LLM is configured.
function mockRoleProfile(text) {
  // Use the first line / first few words as the label.
  const firstLine = text.split(/[\n.]/)[0].trim();
  const label = (firstLine.length <= 48 ? firstLine : firstLine.slice(0, 45) + '…') || 'Custom Role';
  return {
    id: 'custom',
    label,
    focus:
      `role-specific fundamentals, applied problem solving, relevant tools ` +
      `and best practices, collaboration, and communication for a ${label}`,
    competencies: [
      'Role knowledge',
      'Problem solving',
      'Practical skills',
      'Collaboration',
      'Communication',
    ],
  };
}

/** Generate the opening interview question. */
export async function generateFirstQuestion(resume, role, difficulty) {
  if (!llmConfigured) return mockFirstQuestion(resume, role);

  try {
    const content = await chat(
      [
        {
          role: 'system',
          content:
            'You are an expert technical interviewer. Ask one concise, ' +
            'spoken-style interview question at a time. Do not number it or add ' +
            'preamble. Keep it under 45 words.' +
            difficultyLine(difficulty),
        },
        {
          role: 'user',
          content:
            `Here is the candidate context:\n\n${resumeContext(resume, role)}\n\n` +
            `Ask a strong opening interview question tailored to this candidate ` +
            `and the ${role.label} role.`,
        },
      ],
      { temperature: 0.8 }
    );
    return content.trim();
  } catch (err) {
    // A live call failed (rate limit, network, provider error). Degrade to the
    // mock so a demo keeps running instead of erroring out.
    console.error('LLM generateFirstQuestion failed, using mock:', err.message);
    return mockFirstQuestion(resume, role);
  }
}

/**
 * Given the conversation so far, produce a follow-up question that reacts to
 * the candidate's most recent answer.
 * `history` is [{ question, answer }, ...].
 */
export async function generateFollowUp(resume, role, history, difficulty) {
  if (!llmConfigured) return mockFollowUp(resume, role, history);

  const transcript = history
    .map((t, i) => `Q${i + 1}: ${t.question}\nA${i + 1}: ${t.answer}`)
    .join('\n\n');

  // Decide this turn's mode. Mostly move to a NEW topic so the interview
  // covers breadth across the resume and role, only occasionally drilling
  // deeper on the last answer. This prevents the whole interview from becoming
  // one long thread of follow-ups to question 1.
  const goDeeper = Math.random() < 0.3; // ~30% deeper, ~70% new topic
  const askedQuestions = history.map((t, i) => `Q${i + 1}: ${t.question}`).join('\n');
  const modeInstruction = goDeeper
    ? 'For THIS question, dig one level deeper into the candidate\'s most ' +
      'recent answer — probe a specific claim, trade-off, or gap in it.'
    : 'For THIS question, move to a DIFFERENT topic that has NOT been covered ' +
      'yet — pull from a different skill, project, or experience on the resume, ' +
      'or a different competency for the role. Do not follow up on the last ' +
      'answer; start a fresh line of questioning.';

  try {
    const content = await chat(
      [
        {
          role: 'system',
          content:
            'You are an expert interviewer conducting an interview that should ' +
            'cover a BREADTH of topics across the candidate\'s background, not ' +
            'a single deep thread. Ask ONE natural spoken-style question, under ' +
            '45 words, no numbering or preamble. Avoid repeating topics already ' +
            'asked about. ' +
            modeInstruction +
            difficultyLine(difficulty),
        },
        {
          role: 'user',
          content:
            `Candidate context:\n${resumeContext(resume, role)}\n\n` +
            `Questions already asked (avoid repeating these topics):\n${askedQuestions}\n\n` +
            `Full interview so far:\n${transcript}\n\nAsk the next question.`,
        },
      ],
      { temperature: 0.9 }
    );
    return content.trim();
  } catch (err) {
    console.error('LLM generateFollowUp failed, using mock:', err.message);
    return mockFollowUp(resume, role, history);
  }
}

/** Produce the final structured report. */
export async function generateReport(resume, role, history, difficulty) {
  if (!llmConfigured) return mockReport(resume, role, history);

  const transcript = history
    .map((t, i) => {
      const secs = Number.isFinite(t.durationMs) ? Math.round(t.durationMs / 1000) : null;
      const timing = secs != null ? ` (response time: ${secs}s)` : '';
      return `Q${i + 1}: ${t.question}\nA${i + 1}${timing}: ${t.answer}`;
    })
    .join('\n\n');

  try {
    const content = await chat(
      [
        {
          role: 'system',
          content:
            'You are an expert interviewer producing a fair, constructive ' +
            'evaluation.' +
            difficultyLine(difficulty) +
            ' Calibrate all scores to the stated difficulty level. ' +
            'Each answer includes the candidate\'s response time in seconds. ' +
            'Factor pacing into your scoring and feedback: crisp, well-paced ' +
            'answers are a positive signal, while very long delays or rambling ' +
            'that took a long time indicate hesitation or lack of fluency and ' +
            'should lower the relevant scores (especially Communication) and be ' +
            'called out in per-question feedback. Keep pacing a secondary factor ' +
            '— answer quality still matters most, and a brief pause to think is ' +
            'fine. ' +
            'Respond ONLY with a JSON object matching this schema:\n' +
            '{\n' +
            '  "overallScore": number (0-100),\n' +
            '  "summary": string,\n' +
            '  "strengths": string[],\n' +
            '  "improvements": string[],\n' +
            '  "competencyScores": [{ "name": string, "score": number (0-100), "note": string }],\n' +
            '  "perQuestion": [{ "question": string, "score": number (0-100), "feedback": string }],\n' +
            '  "resumeInsights": [{ "type": "backed" | "gap" | "neutral", "text": string }]\n' +
            '}\n' +
            'resumeInsights: 2-4 observations that explicitly tie the interview ' +
            'answers back to SPECIFIC items on the resume (named skills, ' +
            'projects, or experience). Use "backed" when an answer substantiated ' +
            'a resume claim, "gap" when a listed skill/experience was not ' +
            'demonstrated or was weak when probed, and "neutral" otherwise. ' +
            'Reference the resume item by name. If the resume has too little ' +
            'detail, return an empty array.',
        },
        {
          role: 'user',
          content:
            `Role: ${role.label}. Competencies to score: ${role.competencies.join(', ')}.\n\n` +
            `Candidate context:\n${resumeContext(resume, role)}\n\n` +
            `Full interview:\n${transcript}\n\n` +
            `Evaluate the candidate and return the JSON report.`,
        },
      ],
      { json: true, temperature: 0.3 }
    );

    return parseJsonObject(content);
  } catch (err) {
    // Either the live call failed or the model returned malformed JSON — fall
    // back to the heuristic mock report so the interview always ends cleanly.
    console.error('LLM generateReport failed, using mock:', err.message);
    return mockReport(resume, role, history);
  }
}

// ---------------------------------------------------------------------------
// Deterministic mock fallbacks (no API key required)
// ---------------------------------------------------------------------------

function topSkill(resume) {
  return (resume.skills && resume.skills[0]) || null;
}

function mockFirstQuestion(resume, role) {
  const skill = topSkill(resume);
  const who = resume.name ? resume.name.split(' ')[0] : 'there';
  if (skill) {
    return `Hi ${who}! To start, walk me through a project where you used ${skill} and what impact it had.`;
  }
  return `Hi ${who}! To start, tell me about a recent project you're proud of and your specific role in it as a ${role.label}.`;
}

const FOLLOWUP_TEMPLATES = {
  'software-engineer': [
    'How did you decide on the architecture, and what trade-offs did you weigh?',
    'What was the trickiest bug you hit, and how did you diagnose it?',
    'If that system had to handle 10x the load, what would you change first?',
    'How did you test it, and what would you add to catch regressions?',
  ],
  'product-manager': [
    'How did you prioritize what to build, and what did you deprioritize?',
    'What metric defined success, and how did it move?',
    'How did you handle a stakeholder who disagreed with your direction?',
    'Looking back, what would you do differently and why?',
  ],
  'data-scientist': [
    'How did you validate that your model or analysis was actually correct?',
    'What assumptions did the data force you to make, and how risky were they?',
    'How did you translate the result into a decision the business could act on?',
    'If you had more time, what experiment would you run next?',
  ],
};

function mockFollowUp(resume, role, history) {
  const templates = FOLLOWUP_TEMPLATES[role.id] || FOLLOWUP_TEMPLATES['software-engineer'];
  const idx = Math.max(0, history.length - 1) % templates.length;
  const last = history[history.length - 1];
  const ack = last && last.answer && last.answer.length > 5 ? 'Got it. ' : '';
  return `${ack}${templates[idx]}`;
}

/** Very rough heuristic scoring based on answer length/specificity + pacing. */
function scoreAnswer(answer = '', durationMs) {
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  // Count spelled-out numbers too (e.g. "thirty percent") — common in speech.
  const hasNumbers =
    /\d/.test(answer) ||
    /\b(percent|thousand|million|billion|hundred|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty)\b/i.test(
      answer
    );
  const hasSpecifics =
    /(because|so that|which|resulted|reduced|increased|led to|by adding|in order to|impact|latency|throughput)/i.test(
      answer
    );
  let score = Math.min(55, words * 2); // up to 55 for a reasonably detailed answer
  if (hasNumbers) score += 22;
  if (hasSpecifics) score += 22;

  // Light pacing penalty: allow ~1.5s per word plus 15s to think; penalize
  // responses that ran well beyond that (hesitation / rambling).
  if (Number.isFinite(durationMs) && durationMs > 0 && words > 0) {
    const expectedMs = 15000 + words * 1500;
    if (durationMs > expectedMs * 2) score -= 12;
    else if (durationMs > expectedMs * 1.4) score -= 6;
  }

  return Math.max(15, Math.min(100, Math.round(score)));
}

// True when a response was notably slow relative to its length.
function wasSlow(answer = '', durationMs) {
  const words = String(answer).trim().split(/\s+/).filter(Boolean).length;
  if (!Number.isFinite(durationMs) || words === 0) return false;
  return durationMs > (15000 + words * 1500) * 1.4;
}

function mockReport(resume, role, history) {
  const perQuestion = history.map((t) => {
    const score = scoreAnswer(t.answer, t.durationMs);
    const slow = wasSlow(t.answer, t.durationMs);
    let feedback =
      score >= 70
        ? 'Clear, specific answer with good detail.'
        : 'Solid start — add concrete metrics and outcomes to strengthen it.';
    if (slow) feedback += ' Took a while to respond — aim for a crisper, more confident delivery.';
    return { question: t.question, score, feedback };
  });

  const overallScore = perQuestion.length
    ? Math.round(perQuestion.reduce((s, q) => s + q.score, 0) / perQuestion.length)
    : 50;

  const competencyScores = role.competencies.map((name, i) => ({
    name,
    // Spread the overall score a little across competencies for a realistic look.
    score: Math.max(10, Math.min(100, overallScore + ((i % 3) - 1) * 8)),
    note: `${name} assessed from interview responses.`,
  }));

  const strengths = [];
  const improvements = [];
  if (overallScore >= 65) {
    strengths.push('Communicates experience clearly and stays on topic.');
  } else {
    improvements.push('Give more structured, detailed answers (situation → action → result).');
  }
  if (history.some((t) => /\d/.test(t.answer || ''))) {
    strengths.push('Backs claims with concrete numbers and outcomes.');
  } else {
    improvements.push('Quantify impact with metrics wherever possible.');
  }
  if ((resume.skills || []).length >= 5) {
    strengths.push('Broad, relevant skill set for the target role.');
  }
  improvements.push(`Deepen ${role.label}-specific fundamentals: ${role.focus.split(',')[0]}.`);

  const resumeInsights = mockResumeInsights(resume, history);

  return {
    overallScore,
    summary:
      `Based on ${history.length} responses for the ${role.label} role, the ` +
      `candidate scored ${overallScore}/100. ${
        overallScore >= 65
          ? 'A strong showing with clear communication.'
          : 'A promising start with clear room to grow.'
      } (Generated by the built-in mock evaluator — set OPENAI_API_KEY for LLM-quality feedback.)`,
    strengths: strengths.length ? strengths : ['Engaged with every question.'],
    improvements,
    competencyScores,
    perQuestion,
    resumeInsights,
  };
}

// Heuristic resume-grounded insights for the mock evaluator: which listed
// skills actually came up in the answers ("backed") versus went unmentioned
// ("gap"), plus a note on quantified impact.
function mockResumeInsights(resume, history) {
  const insights = [];
  const answersText = history
    .map((t) => (t.answer || '').toLowerCase())
    .join(' \n ');
  const skills = (resume.skills || []).filter(Boolean);

  const mentioned = [];
  const unmentioned = [];
  for (const skill of skills) {
    const s = String(skill).toLowerCase().trim();
    if (!s) continue;
    if (answersText.includes(s)) mentioned.push(skill);
    else unmentioned.push(skill);
  }

  if (mentioned.length) {
    insights.push({
      type: 'backed',
      text: `You spoke to ${mentioned.slice(0, 3).join(', ')} from your resume during the interview.`,
    });
  }
  if (unmentioned.length) {
    insights.push({
      type: 'gap',
      text: `Listed on your resume but never came up: ${unmentioned.slice(0, 3).join(', ')}. Work these into your examples.`,
    });
  }

  const quantified = history.some((t) => /\d/.test(t.answer || ''));
  insights.push(
    quantified
      ? { type: 'backed', text: 'Your answers included concrete numbers, which reinforces the impact claimed on your resume.' }
      : { type: 'gap', text: 'Your resume implies measurable impact, but answers lacked specific metrics — quantify results.' }
  );

  return insights.slice(0, 4);
}
