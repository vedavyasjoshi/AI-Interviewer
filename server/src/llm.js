// LLM integration (OpenAI-compatible chat completions) with a deterministic
// mock fallback so the app is fully demoable without any API key.

const API_KEY = process.env.OPENAI_API_KEY;
const BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

export const llmConfigured = Boolean(API_KEY);

/**
 * Low-level chat call. Returns the assistant message content string.
 * `json` = true asks the model for a JSON object response.
 */
async function chat(messages, { json = false, temperature = 0.7 } = {}) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
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

  try {
    const content = await chat(
      [
        {
          role: 'system',
          content:
            'You are an expert interviewer conducting an adaptive interview. ' +
            'Based on the candidate answers, ask ONE natural follow-up question ' +
            'that digs deeper, probes a gap, or moves to a new relevant area. ' +
            'Spoken style, under 45 words, no numbering or preamble.' +
            difficultyLine(difficulty),
        },
        {
          role: 'user',
          content:
            `Candidate context:\n${resumeContext(resume, role)}\n\n` +
            `Interview so far:\n${transcript}\n\nAsk the next question.`,
        },
      ],
      { temperature: 0.8 }
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
    .map((t, i) => `Q${i + 1}: ${t.question}\nA${i + 1}: ${t.answer}`)
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

    return JSON.parse(content);
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

/** Very rough heuristic scoring based on answer length/specificity. */
function scoreAnswer(answer = '') {
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
  return Math.max(15, Math.min(100, Math.round(score)));
}

function mockReport(resume, role, history) {
  const perQuestion = history.map((t) => ({
    question: t.question,
    score: scoreAnswer(t.answer),
    feedback:
      scoreAnswer(t.answer) >= 70
        ? 'Clear, specific answer with good detail.'
        : 'Solid start — add concrete metrics and outcomes to strengthen it.',
  }));

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
