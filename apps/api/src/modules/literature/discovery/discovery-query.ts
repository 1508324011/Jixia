import {
  literatureDiscoveryDefaultLimit,
  literatureDiscoveryMaxLimit,
  literatureDiscoveryMinLimit
} from "@jixia/shared";
import { z } from "zod";

export function normalizeLiteratureDiscoveryQuery(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export const literatureDiscoverySearchRequestSchema = z.object({
  query: z.string()
    .transform(normalizeLiteratureDiscoveryQuery)
    .pipe(z.string().min(1).max(512)),
  limit: z.number().int().min(literatureDiscoveryMinLimit).max(literatureDiscoveryMaxLimit)
    .default(literatureDiscoveryDefaultLimit),
  cursor: z.string().min(1).max(128 * 1024).optional()
}).strict();
