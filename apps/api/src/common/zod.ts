import { BadRequestException } from '@nestjs/common';
import type { z } from 'zod';

export function parseRequest<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({
      message: 'Request validation failed.',
      issues: result.error.issues,
    });
  }
  return result.data;
}
