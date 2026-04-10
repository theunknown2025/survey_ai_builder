import type { Logigramme, Node } from '../types/survey';
import { validateSurvey, type ValidationFinding } from './validator';
import type { SurveyOutput } from './surveySchema';

type SupportedLocale = SurveyOutput['meta']['locale'];
type SupportedStudyType = SurveyOutput['meta']['study_type'];

const LOCALE_MARKERS: Array<{ locale: SupportedLocale; markers: string[] }> = [
  { locale: 'fr-FR', markers: ['merci', 'vous', 'quel', 'quelle', 'fran', 'français', 'francais'] },
  { locale: 'ar-MA', markers: ['العربية', 'عربي', 'اللغة', 'استبيان'] }
];

function inferLocale(context: string): SupportedLocale {
  const lower = context.toLowerCase();
  for (const candidate of LOCALE_MARKERS) {
    if (candidate.markers.some((marker) => lower.includes(marker))) {
      return candidate.locale;
    }
  }
  return 'en-GB';
}

function inferStudyType(context: string): SupportedStudyType {
  const lower = context.toLowerCase();
  if (lower.includes('satisfaction') || lower.includes('nps') || lower.includes('csat')) {
    return 'customer_satisfaction';
  }
  if (lower.includes('ad') || lower.includes('advertising') || lower.includes('campaign')) {
    return 'advertising_evaluation';
  }
  if (lower.includes('pack') || lower.includes('packaging')) {
    return 'pack_testing';
  }
  if (lower.includes('journey') || lower.includes('shopper')) {
    return 'shopper_journey';
  }
  if (lower.includes('brand health') || lower.includes('awareness') || lower.includes('consideration')) {
    return 'brand_health_tracking';
  }
  return 'usage_attitude';
}

function nodeTypeToSurveyType(node: Node): SurveyOutput['sections'][number]['questions'][number]['type'] {
  switch (node.questionType) {
    case 'multiple-choice':
      return 'single_choice';
    case 'yes-no':
      return 'single_choice';
    case 'rating':
      return 'rating_scale';
    case 'text':
      return 'open_text';
    default:
      return 'open_text';
  }
}

function getNodeOptions(node: Node): Array<{ id: string; label: string }> {
  if (node.questionType === 'yes-no') {
    return [
      { id: 'YES', label: 'Yes' },
      { id: 'NO', label: 'No' }
    ];
  }
  const rawOptions = node.options ?? [];
  if (rawOptions.length >= 2) {
    return rawOptions.map((option, idx) => ({
      id: `OPT_${idx + 1}`,
      label: option
    }));
  }
  if (node.questionType === 'multiple-choice') {
    return [
      { id: 'OPT_1', label: 'Option 1' },
      { id: 'OPT_2', label: 'Option 2' }
    ];
  }
  return [];
}

function buildScale(node: Node): { min: number; max: number; labels: Array<{ value: number; label: string }> } | undefined {
  if (node.questionType !== 'rating') return undefined;
  return {
    min: 1,
    max: 5,
    labels: [
      { value: 1, label: 'Very poor' },
      { value: 2, label: 'Poor' },
      { value: 3, label: 'Neutral' },
      { value: 4, label: 'Good' },
      { value: 5, label: 'Excellent' }
    ]
  };
}

function sanitizeText(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : 'Untitled question';
}

function sanitizeSectionId(id: string | undefined, index: number): string {
  const fallback = `SECTION_${index + 1}`;
  const raw = (id && id.trim().length > 0 ? id : fallback).toUpperCase();
  const cleaned = raw.replace(/[^A-Z0-9_\-]/g, '_');
  return cleaned.length > 0 ? cleaned : fallback;
}

export function buildSurveyCandidateFromLogigramme(logigramme: Logigramme, context: string): SurveyOutput {
  const questionNodes = logigramme.nodes.filter((node) => node.type === 'question');
  const idMap = new Map<string, string>();
  questionNodes.forEach((node, index) => idMap.set(node.id, `Q${index + 1}`));

  const sectionMap = new Map(
    (logigramme.sections ?? []).map((section, index) => [
      section.id,
      {
        id: sanitizeSectionId(section.id, index),
        title: section.title || `Section ${index + 1}`,
        description: section.description,
        questions: [] as SurveyOutput['sections'][number]['questions']
      }
    ])
  );

  if (sectionMap.size === 0) {
    sectionMap.set('SECTION_1', {
      id: 'SECTION_1',
      title: 'Main Section',
      description: 'Generated section',
      questions: []
    });
  }

  for (const node of questionNodes) {
    const mappedId = idMap.get(node.id) ?? `Q${sectionMap.size + 1}`;
    const sectionId = node.sectionId && sectionMap.has(node.sectionId) ? node.sectionId : [...sectionMap.keys()][0];
    const surveyType = nodeTypeToSurveyType(node);
    const options = getNodeOptions(node);

    const logic = (logigramme.edges ?? [])
      .filter((edge) => edge.from === node.id)
      .map((edge) => {
        const target = idMap.get(edge.to) ?? 'END';
        return {
          when: {
            question_id: mappedId,
            operator: 'answered' as const,
            value: edge.label || null
          },
          action: {
            type: target === 'END' ? ('terminate' as const) : ('skip_to' as const),
            target
          }
        };
      });

    sectionMap.get(sectionId)?.questions.push({
      id: mappedId,
      code: (node.id || mappedId).replace(/[^A-Za-z0-9_]/g, '_').toUpperCase(),
      type: surveyType,
      text: sanitizeText(node.label),
      required: true,
      options: options.length > 0 ? options : undefined,
      scale: buildScale(node),
      logic: logic.length > 0 ? logic : undefined,
      estimated_seconds: node.questionType === 'text' ? 30 : 20
    });
  }

  return {
    meta: {
      survey_id: `generated_${Date.now()}`,
      title: 'Generated Survey',
      locale: inferLocale(context),
      study_type: inferStudyType(context),
      target_length_minutes: Math.max(3, Math.ceil(questionNodes.length * 0.5)),
      generated_at: new Date().toISOString()
    },
    sections: [...sectionMap.values()].filter((section) => section.questions.length > 0)
  };
}

export function validateGeneratedLogigramme(logigramme: Logigramme, context: string): {
  valid: boolean;
  findings: ValidationFinding[];
} {
  const surveyCandidate = buildSurveyCandidateFromLogigramme(logigramme, context);
  const result = validateSurvey(surveyCandidate, {
    ragCoverageThreshold: 0,
    requiredBlocksByStudyType: {}
  });
  return {
    valid: result.valid,
    findings: result.findings
  };
}
