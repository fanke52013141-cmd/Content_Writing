import { z } from 'zod';

export const deletionModeSchema = z.enum(['archive', 'soft', 'permanent']);
export const deleteContentSchema = z.object({ mode: deletionModeSchema }).strict();
export const deletionAuditSchema = z.object({
  id: z.uuid(),
  objectId: z.uuid(),
  objectType: z.string().min(1).max(80),
  mode: deletionModeSchema,
  occurredAt: z.iso.datetime(),
});
export type DeletionMode = z.infer<typeof deletionModeSchema>;
export type DeleteContent = z.infer<typeof deleteContentSchema>;
export type DeletionAudit = z.infer<typeof deletionAuditSchema>;
