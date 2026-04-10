import { z } from 'zod';

export const SUPPORTED_LOCALES = ['en-GB', 'fr-FR', 'ar-MA'] as const;

export const SUPPORTED_STUDY_TYPES = [
  'brand_health_tracking',
  'shopper_journey',
  'pack_testing',
  'usage_attitude',
  'advertising_evaluation',
  'customer_satisfaction'
] as const;

const OptionSchema = z
  .object({
    id: z.string().regex(/^[A-Z0-9_\-]+$/),
    label: z.string().min(1),
    exclusive: z.boolean().optional().default(false)
  })
  .strict();

const ValidationSchema = z
  .object({
    min: z.number().optional(),
    max: z.number().optional(),
    max_length: z.number().int().min(1).optional(),
    min_selections: z.number().int().min(0).optional(),
    max_selections: z.number().int().min(1).optional()
  })
  .strict();

const ScaleLabelSchema = z
  .object({
    value: z.number().int(),
    label: z.string().min(1)
  })
  .strict();

const ScaleSchema = z
  .object({
    min: z.number().int(),
    max: z.number().int(),
    labels: z.array(ScaleLabelSchema).min(1)
  })
  .strict();

const LogicRuleSchema = z
  .object({
    when: z
      .object({
        question_id: z.string().regex(/^Q[0-9]{1,4}$/),
        operator: z.enum([
          'equals',
          'not_equals',
          'in',
          'not_in',
          'gt',
          'gte',
          'lt',
          'lte',
          'answered'
        ]),
        value: z.unknown()
      })
      .strict(),
    action: z
      .object({
        type: z.enum(['show', 'hide', 'skip_to', 'terminate']),
        target: z.string().min(1)
      })
      .strict()
  })
  .strict();

const BaseQuestionSchema = z
  .object({
    id: z.string().regex(/^Q[0-9]{1,4}$/),
    code: z.string().regex(/^[A-Z0-9_]+$/),
    type: z.enum([
      'single_choice',
      'multi_choice',
      'numeric',
      'open_text',
      'rating_scale',
      'matrix_single',
      'matrix_multi',
      'rank_order',
      'info'
    ]),
    text: z.string().min(2),
    instruction: z.string().optional(),
    required: z.boolean().optional().default(true),
    randomize_options: z.boolean().optional().default(false),
    allow_other: z.boolean().optional().default(false),
    allow_none: z.boolean().optional().default(false),
    options: z.array(OptionSchema).optional(),
    rows: z.array(OptionSchema).optional(),
    columns: z.array(OptionSchema).optional(),
    scale: ScaleSchema.optional(),
    validation: ValidationSchema.optional(),
    logic: z.array(LogicRuleSchema).optional(),
    estimated_seconds: z.number().int().min(3).max(300).optional(),
    tags: z.array(z.string()).optional(),
    source_chunk_ids: z.array(z.string()).optional()
  })
  .strict()
  .superRefine((question, ctx) => {
    if (question.type === 'single_choice' || question.type === 'multi_choice') {
      if (!question.options || question.options.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${question.type} requires non-empty options`
        });
      }
    }

    if (question.type === 'matrix_single' || question.type === 'matrix_multi') {
      if (!question.rows || !question.columns) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${question.type} requires rows and columns`
        });
      }
    }

    if (question.type === 'rating_scale' && !question.scale) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'rating_scale requires scale'
      });
    }

    if (question.type === 'numeric' && !question.validation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'numeric requires validation'
      });
    }
  });

const SectionSchema = z
  .object({
    id: z.string().regex(/^[A-Z0-9_\-]+$/),
    title: z.string().min(2),
    description: z.string().optional(),
    questions: z.array(BaseQuestionSchema).min(1)
  })
  .strict();

const MetaSchema = z
  .object({
    survey_id: z.string().min(3),
    title: z.string().min(3),
    locale: z.enum(SUPPORTED_LOCALES),
    study_type: z.enum(SUPPORTED_STUDY_TYPES),
    target_length_minutes: z.number().int().min(3).max(60),
    generated_at: z.string().datetime(),
    audience: z.string().optional(),
    source_chunks: z.array(z.string()).optional()
  })
  .strict();

export const SurveyOutputSchema = z
  .object({
    meta: MetaSchema,
    sections: z.array(SectionSchema).min(1)
  })
  .strict();

export type SurveyOutput = z.infer<typeof SurveyOutputSchema>;
export type SurveyQuestion = z.infer<typeof BaseQuestionSchema>;
