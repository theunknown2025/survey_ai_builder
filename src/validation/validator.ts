import { type SurveyOutput, SurveyOutputSchema } from './surveySchema';

export type RuleSeverity = 'error' | 'warning';

export interface ValidationFinding {
  rule_id: string;
  severity: RuleSeverity;
  message: string;
  question_id?: string;
}

export interface ValidationOptions {
  allowedTerminatorTargets?: string[];
  requiredBlocksByStudyType?: Partial<Record<SurveyOutput['meta']['study_type'], string[]>>;
  knownChunkIds?: Set<string>;
  ragCoverageThreshold?: number;
  semanticDuplicateThreshold?: number;
  lengthToleranceRatio?: number;
}

const PLACEHOLDER_PATTERNS = [/^\s*\.\.\.\s*$/i, /^\s*tbd\s*$/i, /^\s*option\s+\d+\s*$/i];
const LEADING_PATTERNS = [/don't you agree/i, /\bobviously\b/i, /\bbest brand\b/i];
const DOUBLE_BARRELED_PATTERNS = [/\band\/or\b/i, /\bhow .* and .*?\?/i];

function flattenQuestions(survey: SurveyOutput): SurveyOutput['sections'][number]['questions'] {
  return survey.sections.flatMap((section) => section.questions);
}

function addFinding(findings: ValidationFinding[], finding: ValidationFinding): void {
  findings.push(finding);
}

function normalizedTokens(input: string): Set<string> {
  const tokens = input
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);
  return new Set(tokens);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function languageConsistency(locale: SurveyOutput['meta']['locale'], text: string): boolean {
  const lower = text.toLowerCase();
  const frSignals = [' le ', ' la ', ' les ', ' et ', ' vous ', ' de ', ' des ', ' une ', ' un '];
  const enSignals = [' the ', ' and ', ' you ', ' your ', ' to ', ' of ', ' is ', ' are '];
  const arSignals = ['ال', 'من', 'في', 'على'];

  if (locale === 'fr-FR') {
    return frSignals.some((signal) => lower.includes(signal));
  }
  if (locale === 'en-GB') {
    return enSignals.some((signal) => lower.includes(signal));
  }
  if (locale === 'ar-MA') {
    return arSignals.some((signal) => lower.includes(signal));
  }
  return true;
}

function hasCycle(adjacency: Map<string, string[]>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;

    visiting.add(node);
    for (const next of adjacency.get(node) ?? []) {
      if (visit(next)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };

  for (const node of adjacency.keys()) {
    if (visit(node)) return true;
  }
  return false;
}

function requiredCoveragePass(
  survey: SurveyOutput,
  requiredBlocksByStudyType: NonNullable<ValidationOptions['requiredBlocksByStudyType']>
): boolean {
  const requiredCodes = requiredBlocksByStudyType[survey.meta.study_type] ?? [];
  if (requiredCodes.length === 0) return true;
  const allCodes = new Set(flattenQuestions(survey).map((q) => q.code));
  return requiredCodes.every((code) => allCodes.has(code));
}

export function validateSurvey(
  candidate: unknown,
  options: ValidationOptions = {}
): { valid: boolean; findings: ValidationFinding[]; parsed?: SurveyOutput } {
  const findings: ValidationFinding[] = [];
  const parsedResult = SurveyOutputSchema.safeParse(candidate);

  if (!parsedResult.success) {
    for (const issue of parsedResult.error.issues) {
      addFinding(findings, {
        rule_id: 'R00_SCHEMA',
        severity: 'error',
        message: `${issue.path.join('.') || 'root'}: ${issue.message}`
      });
    }
    return { valid: false, findings };
  }

  const survey = parsedResult.data;
  const questions = flattenQuestions(survey);
  const terminators = new Set(options.allowedTerminatorTargets ?? ['END', 'TERMINATE']);
  const ragCoverageThreshold = options.ragCoverageThreshold ?? 0.7;
  const semanticDuplicateThreshold = options.semanticDuplicateThreshold ?? 0.92;
  const lengthToleranceRatio = options.lengthToleranceRatio ?? 0.15;
  const requiredBlocksByStudyType = options.requiredBlocksByStudyType ?? {
    customer_satisfaction: ['RECO']
  };

  const questionIds = new Set<string>();
  const questionCodes = new Set<string>();
  const adjacency = new Map<string, string[]>();
  let secondsTotal = 0;
  let groundedCount = 0;

  for (const question of questions) {
    secondsTotal += question.estimated_seconds ?? 20;
    adjacency.set(question.id, []);

    // R01 Unique question IDs
    if (questionIds.has(question.id)) {
      addFinding(findings, {
        rule_id: 'R01_UNIQUE_QUESTION_IDS',
        severity: 'error',
        question_id: question.id,
        message: `Duplicate question id '${question.id}'`
      });
    } else {
      questionIds.add(question.id);
    }

    // R02 Unique question codes
    if (questionCodes.has(question.code)) {
      addFinding(findings, {
        rule_id: 'R02_UNIQUE_QUESTION_CODES',
        severity: 'error',
        question_id: question.id,
        message: `Duplicate question code '${question.code}'`
      });
    } else {
      questionCodes.add(question.code);
    }

    // R05 Mandatory structure by type
    if ((question.type === 'single_choice' || question.type === 'multi_choice') && !question.options?.length) {
      addFinding(findings, {
        rule_id: 'R05_TYPE_STRUCTURE',
        severity: 'error',
        question_id: question.id,
        message: `${question.type} requires options`
      });
    }
    if ((question.type === 'matrix_single' || question.type === 'matrix_multi') && (!question.rows || !question.columns)) {
      addFinding(findings, {
        rule_id: 'R05_TYPE_STRUCTURE',
        severity: 'error',
        question_id: question.id,
        message: `${question.type} requires rows and columns`
      });
    }
    if (question.type === 'rating_scale' && !question.scale) {
      addFinding(findings, {
        rule_id: 'R05_TYPE_STRUCTURE',
        severity: 'error',
        question_id: question.id,
        message: 'rating_scale requires scale'
      });
    }

    // R06 Minimum options
    if (
      (question.type === 'single_choice' || question.type === 'multi_choice') &&
      (question.options?.length ?? 0) < 2
    ) {
      addFinding(findings, {
        rule_id: 'R06_MIN_OPTIONS',
        severity: 'error',
        question_id: question.id,
        message: 'Choice questions must include at least 2 options'
      });
    }

    // R07 Matrix dimensional sanity
    if (
      (question.type === 'matrix_single' || question.type === 'matrix_multi') &&
      ((question.rows?.length ?? 0) < 2 || (question.columns?.length ?? 0) < 2)
    ) {
      addFinding(findings, {
        rule_id: 'R07_MATRIX_DIMENSIONS',
        severity: 'error',
        question_id: question.id,
        message: 'Matrix questions must include >=2 rows and >=2 columns'
      });
    }

    // R08 Option ID uniqueness per question
    const allOptionIds = [
      ...(question.options?.map((o) => o.id) ?? []),
      ...(question.rows?.map((o) => o.id) ?? []),
      ...(question.columns?.map((o) => o.id) ?? [])
    ];
    if (new Set(allOptionIds).size !== allOptionIds.length) {
      addFinding(findings, {
        rule_id: 'R08_OPTION_ID_UNIQUENESS',
        severity: 'error',
        question_id: question.id,
        message: 'Duplicate option/row/column IDs inside question'
      });
    }

    // R09 Selection bounds validity
    if (question.type === 'multi_choice' && question.validation) {
      const minSel = question.validation.min_selections ?? 0;
      const maxSel = question.validation.max_selections ?? Number.MAX_SAFE_INTEGER;
      const optionsCount = question.options?.length ?? 0;
      if (minSel > maxSel || maxSel > optionsCount) {
        addFinding(findings, {
          rule_id: 'R09_SELECTION_BOUNDS',
          severity: 'error',
          question_id: question.id,
          message: 'Invalid min/max selections for multi_choice question'
        });
      }
    }

    // R10 Numeric bounds validity
    if (question.type === 'numeric' && question.validation?.min !== undefined && question.validation.max !== undefined) {
      if (question.validation.min >= question.validation.max) {
        addFinding(findings, {
          rule_id: 'R10_NUMERIC_BOUNDS',
          severity: 'error',
          question_id: question.id,
          message: 'Numeric min must be lower than max'
        });
      }
    }

    // R11 Rating scale monotonicity
    if (question.type === 'rating_scale' && question.scale) {
      if (question.scale.min >= question.scale.max) {
        addFinding(findings, {
          rule_id: 'R11_SCALE_MONOTONICITY',
          severity: 'error',
          question_id: question.id,
          message: 'Scale min must be lower than scale max'
        });
      }
      let prev = Number.MIN_SAFE_INTEGER;
      for (const label of question.scale.labels) {
        if (label.value < question.scale.min || label.value > question.scale.max || label.value <= prev) {
          addFinding(findings, {
            rule_id: 'R11_SCALE_MONOTONICITY',
            severity: 'error',
            question_id: question.id,
            message: 'Scale labels must be strictly increasing and within scale bounds'
          });
          break;
        }
        prev = label.value;
      }
    }

    // R12 Locale-language consistency
    const languageTexts = [
      question.text,
      ...(question.options?.map((o) => o.label) ?? []),
      ...(question.rows?.map((o) => o.label) ?? []),
      ...(question.columns?.map((o) => o.label) ?? [])
    ];
    if (!languageTexts.every((text) => languageConsistency(survey.meta.locale, ` ${text} `))) {
      addFinding(findings, {
        rule_id: 'R12_LOCALE_CONSISTENCY',
        severity: 'error',
        question_id: question.id,
        message: `Question content does not match locale '${survey.meta.locale}'`
      });
    }

    // R13 No empty or placeholder text
    const allLabels = [
      question.text,
      ...(question.options?.map((o) => o.label) ?? []),
      ...(question.rows?.map((o) => o.label) ?? []),
      ...(question.columns?.map((o) => o.label) ?? [])
    ];
    for (const label of allLabels) {
      if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(label.trim()))) {
        addFinding(findings, {
          rule_id: 'R13_PLACEHOLDER_TEXT',
          severity: 'error',
          question_id: question.id,
          message: `Placeholder-like text found: '${label}'`
        });
        break;
      }
    }

    // R14 Question text clarity lint
    if (DOUBLE_BARRELED_PATTERNS.some((pattern) => pattern.test(question.text))) {
      addFinding(findings, {
        rule_id: 'R14_CLARITY_LINT',
        severity: 'warning',
        question_id: question.id,
        message: 'Potential double-barreled wording detected'
      });
    }

    // R15 Leading/biased wording lint
    if (LEADING_PATTERNS.some((pattern) => pattern.test(question.text))) {
      addFinding(findings, {
        rule_id: 'R15_BIAS_LINT',
        severity: 'warning',
        question_id: question.id,
        message: 'Potential leading or biased wording detected'
      });
    }

    // R03 valid branching targets + adjacency build
    for (const logicRule of question.logic ?? []) {
      const actionType = logicRule.action.type;
      const target = logicRule.action.target;
      if (actionType === 'skip_to' || actionType === 'show' || actionType === 'hide') {
        adjacency.get(question.id)?.push(target);
      }
      if (actionType === 'terminate' && !terminators.has(target)) {
        addFinding(findings, {
          rule_id: 'R03_BRANCH_TARGETS',
          severity: 'error',
          question_id: question.id,
          message: `Terminate target '${target}' is not an allowed terminator`
        });
      }
    }

    // R19 RAG grounding coverage counter
    if ((question.source_chunk_ids?.length ?? 0) > 0) {
      groundedCount += 1;
    }
  }

  // R03 valid branching targets (question existence)
  for (const [from, targets] of adjacency.entries()) {
    for (const target of targets) {
      if (!questionIds.has(target)) {
        addFinding(findings, {
          rule_id: 'R03_BRANCH_TARGETS',
          severity: 'error',
          question_id: from,
          message: `Logic target '${target}' does not exist`
        });
      }
    }
  }

  // R04 No backward infinite loops
  if (hasCycle(adjacency)) {
    addFinding(findings, {
      rule_id: 'R04_LOGIC_CYCLES',
      severity: 'error',
      message: 'Logic graph contains at least one cycle'
    });
  }

  // R16 Duplicate semantic content
  for (const section of survey.sections) {
    const questionTokens = section.questions.map((q) => ({ id: q.id, tokens: normalizedTokens(q.text) }));
    for (let i = 0; i < questionTokens.length; i += 1) {
      for (let j = i + 1; j < questionTokens.length; j += 1) {
        const sim = jaccardSimilarity(questionTokens[i].tokens, questionTokens[j].tokens);
        if (sim > semanticDuplicateThreshold) {
          addFinding(findings, {
            rule_id: 'R16_SEMANTIC_DUPLICATES',
            severity: 'warning',
            question_id: questionTokens[j].id,
            message: `Question text is very similar to '${questionTokens[i].id}' (similarity=${sim.toFixed(2)})`
          });
        }
      }
    }
  }

  // R17 Interview length budget
  const minutesTotal = secondsTotal / 60;
  const lowerBound = survey.meta.target_length_minutes * (1 - lengthToleranceRatio);
  const upperBound = survey.meta.target_length_minutes * (1 + lengthToleranceRatio);
  if (minutesTotal < lowerBound || minutesTotal > upperBound) {
    addFinding(findings, {
      rule_id: 'R17_LENGTH_BUDGET',
      severity: 'error',
      message: `Estimated length ${minutesTotal.toFixed(1)} min is outside range ${lowerBound.toFixed(
        1
      )}-${upperBound.toFixed(1)}`
    });
  }

  // R18 Required blocks by study type
  if (!requiredCoveragePass(survey, requiredBlocksByStudyType)) {
    addFinding(findings, {
      rule_id: 'R18_REQUIRED_BLOCKS',
      severity: 'error',
      message: `Missing required question codes for study type '${survey.meta.study_type}'`
    });
  }

  // R19 RAG grounding coverage
  const groundedRatio = questions.length === 0 ? 0 : groundedCount / questions.length;
  if (groundedRatio < ragCoverageThreshold) {
    addFinding(findings, {
      rule_id: 'R19_RAG_COVERAGE',
      severity: 'warning',
      message: `Grounded question ratio ${(groundedRatio * 100).toFixed(
        1
      )}% is below threshold ${(ragCoverageThreshold * 100).toFixed(0)}%`
    });
  }

  // R20 Source consistency check
  if (options.knownChunkIds) {
    for (const question of questions) {
      for (const chunkId of question.source_chunk_ids ?? []) {
        if (!options.knownChunkIds.has(chunkId)) {
          addFinding(findings, {
            rule_id: 'R20_SOURCE_CONSISTENCY',
            severity: 'warning',
            question_id: question.id,
            message: `Unknown source chunk id '${chunkId}'`
          });
        }
      }
    }
  }

  const valid = findings.every((finding) => finding.severity !== 'error');
  return { valid, findings, parsed: survey };
}
