import { z } from 'zod';

export const localUserSchema = z.object({
  id: z.uuid(),
  displayName: z.string().min(1).max(80),
  pinEnabled: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type LocalUser = z.infer<typeof localUserSchema>;

export const updateLocalUserSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80),
  })
  .strict();

export type UpdateLocalUser = z.infer<typeof updateLocalUserSchema>;

export const setLocalPinSchema = z
  .object({
    pin: z.string().regex(/^\d{4,12}$/u, 'PIN must contain 4 to 12 digits.'),
  })
  .strict();

export type SetLocalPin = z.infer<typeof setLocalPinSchema>;

export const verifyLocalPinSchema = setLocalPinSchema;
export type VerifyLocalPin = z.infer<typeof verifyLocalPinSchema>;
