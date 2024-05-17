import { z } from 'zod'
import { type JSONContent } from '@tiptap/core'

export const contentSchema: z.ZodType<JSONContent> = z.lazy(() =>
  z.intersection(
    z.record(z.any()),
    z.object({
      type: z.string().optional(),
      attrs: z.record(z.any()).optional(),
      content: z.array(contentSchema).optional(),
      marks: z
        .array(
          z.intersection(
            z.record(z.any()),
            z.object({
              type: z.string(),
              attrs: z.record(z.any()).optional(),
            })
          )
        )
        .optional(),
      text: z.string().optional(),
    })
  )
)

export const DashboardQuestionItemSchema = z
  .object({
    type: z.literal('question'),
    slug: z.string(),
  })
  .strict()

export const DashboardLinkItemSchema = z
  .object({
    type: z.literal('link'),
    url: z.string(),
  })
  .strict()

export const DashboardTextItemSchema = z
  .object({
    type: z.literal('text'),
    id: z.string(),
    content: contentSchema,
  })
  .strict()

export const DashboardItemSchema = z.union([
  DashboardQuestionItemSchema,
  DashboardLinkItemSchema,
  DashboardTextItemSchema,
])

export const ReportStatus = z.enum([
  'new',
  'under review',
  'resolved',
  'needs admin',
])

export const Report = z.object({
  report_id: z.number(),
  user_id: z.string(),
  contract_id: z.string(),
  comment_id: z.string(),
  status: ReportStatus,
  created_time: z.string(),
  contract_slug: z.string(),
  contract_question: z.string(),
  content: contentSchema,
  creator_username: z.string(),
})
