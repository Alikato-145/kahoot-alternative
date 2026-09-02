import { z } from 'zod'

const choiceSchema = z.object({ id: z.string().uuid().optional(), body: z.string().trim().min(1), isCorrect: z.boolean() })
const questionSchema = z.object({
  id: z.string().uuid().optional(), body: z.string().trim().min(1), questionImageUrl: z.string().startsWith('/media/').nullable().optional(),
  revealImageUrl: z.string().startsWith('/media/').nullable().optional(), explanation: z.string().nullable().optional(),
  choices: z.array(choiceSchema).length(4),
}).superRefine((question, context) => {
  if (question.choices.filter((choice) => choice.isCorrect).length !== 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Each question must have exactly one correct choice', path: ['choices'] })
  }
})

export const quizInputSchema = z.object({
  title: z.string().trim().min(1), description: z.string().default(''), coverImageUrl: z.string().startsWith('/media/').nullable().optional(),
  questions: z.array(questionSchema),
})
