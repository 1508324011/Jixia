import { providerRecordKeyMaxLength } from "@jixia/shared";
import { z } from "zod";

const maximumUrlLength = 4_096;
const maximumAbstractPositions = 20_000;

const httpUrlSchema = z.url().max(maximumUrlLength).refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "https:" || protocol === "http:";
});
const openAlexWorkUrlSchema = z.string()
  .max("https://openalex.org/".length + providerRecordKeyMaxLength)
  .regex(/^https:\/\/openalex\.org\/W\d+$/u);
const openAlexSourceUrlSchema = z.string().regex(/^https:\/\/openalex\.org\/S\d+$/u);
const openAlexHostOrganizationUrlSchema = z.string().regex(
  /^https:\/\/openalex\.org\/[A-Z]\d+$/u
);
const orcidUrlSchema = z.string().regex(
  /^https:\/\/orcid\.org\/\d{4}-\d{4}-\d{4}-[\dX]{4}$/u
);
const issnSchema = z.string().regex(/^\d{4}-[\dX]{4}$/u);
const boundedTextSchema = z.string().max(20_000);

const openAlexSourceSchema = z.object({
  id: openAlexSourceUrlSchema,
  display_name: z.string().min(1).max(1_024),
  issn_l: issnSchema.nullable(),
  issn: z.array(issnSchema).max(100).nullable(),
  host_organization: openAlexHostOrganizationUrlSchema.nullable(),
  host_organization_name: z.string().min(1).max(1_024).nullable(),
  type: z.string().min(1).max(128)
});

const openAlexLocationSchema = z.object({
  is_oa: z.boolean(),
  landing_page_url: httpUrlSchema.nullable(),
  pdf_url: httpUrlSchema.nullable(),
  source: openAlexSourceSchema.nullable(),
  license: z.string().min(1).max(256).nullable(),
  version: z.enum([
    "publishedVersion",
    "acceptedVersion",
    "submittedVersion"
  ]).nullable()
});

const openAlexIdsSchema = z.object({
  openalex: openAlexWorkUrlSchema.optional(),
  doi: httpUrlSchema.nullable().optional(),
  pmid: z.string().max(512).nullable().optional(),
  pmcid: z.string().max(512).nullable().optional()
});

const abstractInvertedIndexSchema = z.record(
  z.string().min(1).max(512),
  z.array(
    z.number().int().min(0).max(maximumAbstractPositions - 1)
  ).min(1).max(maximumAbstractPositions)
).nullable();

export const openAlexWorkSchema = z.object({
  id: openAlexWorkUrlSchema,
  doi: httpUrlSchema.nullable(),
  title: boundedTextSchema.nullable(),
  publication_year: z.number().int().min(0).max(9_999).nullable(),
  publication_date: z.iso.date().nullable(),
  type: z.string().min(1).max(128),
  primary_location: openAlexLocationSchema.nullable(),
  best_oa_location: openAlexLocationSchema.nullable(),
  open_access: z.object({
    is_oa: z.boolean(),
    oa_url: httpUrlSchema.nullable()
  }),
  authorships: z.array(z.object({
    author: z.object({
      display_name: z.string().min(1).max(1_024),
      orcid: orcidUrlSchema.nullable()
    })
  })).max(100),
  ids: openAlexIdsSchema,
  abstract_inverted_index: abstractInvertedIndexSchema
});

export const openAlexSearchResponseSchema = z.object({
  meta: z.object({
    count: z.number().int().min(0),
    per_page: z.number().int().min(1).max(100),
    next_cursor: z.string().min(1).max(2_048).nullable()
  }),
  results: z.array(openAlexWorkSchema).max(20)
});

export type OpenAlexWork = z.infer<typeof openAlexWorkSchema>;
export type OpenAlexSearchResponse = z.infer<typeof openAlexSearchResponseSchema>;
