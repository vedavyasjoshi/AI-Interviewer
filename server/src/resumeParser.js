// Resume parsing: extract raw text from an uploaded file, then structure it
// into { name, skills, experience, education, projects, summary }.
//
// Text extraction supports PDF, DOCX, and plain text. Structuring is done
// heuristically (section detection + keyword matching) so it works with zero
// API keys; if an LLM is configured, `structureWithLLM` can refine it.

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

/** Extract plain text from an uploaded file buffer based on mimetype/name. */
export async function extractText(buffer, filename = '', mimetype = '') {
  const lower = filename.toLowerCase();

  if (mimetype.includes('pdf') || lower.endsWith('.pdf')) {
    // pdf-parse is CommonJS; require it lazily so startup doesn't fail if the
    // optional dep is missing in a stripped-down demo environment.
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    return data.text || '';
  }

  if (
    mimetype.includes('word') ||
    mimetype.includes('officedocument') ||
    lower.endsWith('.docx')
  ) {
    const mammoth = require('mammoth');
    const { value } = await mammoth.extractRawText({ buffer });
    return value || '';
  }

  // Fallback: treat as UTF-8 text (.txt, .md, or unknown).
  return buffer.toString('utf8');
}

const SKILL_DICTIONARY = [
  // languages
  'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'go', 'golang',
  'rust', 'ruby', 'php', 'swift', 'kotlin', 'scala', 'r', 'sql', 'bash',
  // web / frameworks
  'react', 'vue', 'angular', 'node', 'node.js', 'express', 'next.js', 'django',
  'flask', 'spring', 'rails', 'graphql', 'rest',
  // data / ml
  'pandas', 'numpy', 'scikit-learn', 'sklearn', 'tensorflow', 'pytorch',
  'keras', 'spark', 'hadoop', 'tableau', 'power bi', 'matplotlib', 'jupyter',
  'machine learning', 'deep learning', 'nlp', 'statistics', 'a/b testing',
  'experimentation', 'etl', 'airflow', 'dbt', 'snowflake', 'redshift',
  // cloud / infra
  'aws', 'gcp', 'azure', 'docker', 'kubernetes', 'terraform', 'ci/cd',
  'jenkins', 'git', 'linux', 'microservices',
  // pm
  'roadmap', 'agile', 'scrum', 'jira', 'stakeholder', 'go-to-market',
  'product strategy', 'user research', 'kpi', 'okr', 'figma', 'wireframing',
  // db
  'postgresql', 'postgres', 'mysql', 'mongodb', 'redis', 'dynamodb',
];

const SECTION_HEADERS = {
  experience: [
    'experience', 'work experience', 'professional experience',
    'employment', 'work history',
  ],
  education: ['education', 'academic', 'qualifications'],
  projects: ['projects', 'personal projects', 'selected projects'],
  skills: ['skills', 'technical skills', 'technologies', 'competencies'],
  summary: ['summary', 'objective', 'profile', 'about'],
};

/** Split raw resume text into sections keyed by our canonical section names. */
function splitIntoSections(text) {
  const lines = text.split(/\r?\n/);
  const sections = {};
  let current = 'header';
  sections[current] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const normalized = line.toLowerCase().replace(/[:•\-–—]/g, '').trim();
    let matchedSection = null;

    for (const [section, headers] of Object.entries(SECTION_HEADERS)) {
      // A header line is short and matches one of the known section names.
      if (
        line.length <= 40 &&
        headers.some((h) => normalized === h || normalized.startsWith(h + ' '))
      ) {
        matchedSection = section;
        break;
      }
    }

    if (matchedSection) {
      current = matchedSection;
      if (!sections[current]) sections[current] = [];
    } else {
      sections[current].push(line);
    }
  }
  return sections;
}

function guessName(headerLines) {
  if (!headerLines || headerLines.length === 0) return '';
  // Heuristic: first non-empty header line that isn't an email/phone/url.
  for (const line of headerLines) {
    const isContact = /@|https?:\/\/|\+?\d[\d\s().-]{6,}/.test(line);
    const wordCount = line.split(/\s+/).length;
    if (!isContact && wordCount <= 5 && /[a-zA-Z]/.test(line)) {
      return line;
    }
  }
  return '';
}

function extractSkills(text) {
  const lower = text.toLowerCase();
  const found = new Set();
  for (const skill of SKILL_DICTIONARY) {
    // Word-ish boundary match; escape regex specials in the skill token.
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
    if (re.test(lower)) found.add(skill);
  }
  return [...found];
}

/** Group section lines into coarse entries (each bullet/paragraph = an entry). */
function groupEntries(lines = []) {
  const entries = [];
  let buffer = [];
  for (const line of lines) {
    const isBullet = /^[•\-*▪●]/.test(line);
    if (isBullet && buffer.length) {
      entries.push(buffer.join(' ').trim());
      buffer = [line.replace(/^[•\-*▪●]\s*/, '')];
    } else {
      buffer.push(line.replace(/^[•\-*▪●]\s*/, ''));
    }
  }
  if (buffer.length) entries.push(buffer.join(' ').trim());
  return entries.filter(Boolean);
}

/** Main heuristic structuring entry point. */
export function structureResume(rawText) {
  const text = (rawText || '').trim();
  const sections = splitIntoSections(text);

  const skills = extractSkills(text);
  const name = guessName(sections.header);

  const summary =
    (sections.summary && sections.summary.join(' ').trim()) ||
    (sections.header && sections.header.slice(0, 3).join(' ').trim()) ||
    '';

  return {
    name,
    summary,
    skills,
    experience: groupEntries(sections.experience).slice(0, 12),
    education: groupEntries(sections.education).slice(0, 8),
    projects: groupEntries(sections.projects).slice(0, 8),
    rawText: text.slice(0, 12000), // cap what we keep for prompting
  };
}

/** Convenience: extract + structure in one call. */
export async function parseResumeFile(buffer, filename, mimetype) {
  const rawText = await extractText(buffer, filename, mimetype);
  return structureResume(rawText);
}
