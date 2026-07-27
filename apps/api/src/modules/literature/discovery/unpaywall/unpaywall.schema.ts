import { z } from "zod";

const unpaywallMaximumUrlLength = 4_096;
const unpaywallMaximumLocations = 500;

const unpaywallHttpUrlSchema = z.url().max(unpaywallMaximumUrlLength).refine((value) => {
  const url = new URL(value);
  return (
    (url.protocol === "https:" || url.protocol === "http:") &&
    url.username.length === 0 &&
    url.password.length === 0
  );
});

const unpaywallLocationSchema = z.object({
  host_type: z.enum(["publisher", "repository"]),
  license: z.string().min(1).max(256).nullable(),
  version: z.enum([
    "publishedVersion",
    "acceptedVersion",
    "submittedVersion"
  ]).nullable(),
  url: unpaywallHttpUrlSchema,
  url_for_landing_page: unpaywallHttpUrlSchema,
  url_for_pdf: unpaywallHttpUrlSchema.nullable()
}).readonly();

export const unpaywallResponseSchema = z.object({
  doi: z.string().min(1).max(512),
  doi_url: unpaywallHttpUrlSchema,
  is_oa: z.boolean(),
  best_oa_location: unpaywallLocationSchema.nullable(),
  oa_locations: z.array(unpaywallLocationSchema).max(unpaywallMaximumLocations).readonly(),
  publisher: z.string().max(1_024).nullable()
}).readonly();

export type UnpaywallResponse = z.infer<typeof unpaywallResponseSchema>;
