import { z } from "zod";

const crossrefDoiSchema = z.string().max(512);
const crossrefTextSchema = z.string().max(64 * 1024);
const crossrefUrlSchema = z.string().max(4_096);
const utf8Encoder = new TextEncoder();
export const crossrefCursorSchema = z.string().min(1).refine(
  (value) => utf8Encoder.encode(value).byteLength <= 2_048
);

const crossrefDateSchema = z.object({
  "date-parts": z.array(
    z.array(z.number().int()).min(1).max(3).readonly()
  ).min(1).max(4).readonly()
}).readonly();

const crossrefAuthorSchema = z.object({
  given: z.string().max(1_024).optional(),
  family: z.string().max(1_024).optional(),
  name: z.string().max(1_024).optional(),
  ORCID: z.string().max(256).optional()
}).readonly();

export const crossrefWorkSchema = z.object({
  DOI: crossrefDoiSchema,
  title: z.array(crossrefTextSchema).max(8).readonly().optional(),
  abstract: z.string().max(128 * 1024).optional(),
  published: crossrefDateSchema.optional(),
  "published-online": crossrefDateSchema.optional(),
  "published-print": crossrefDateSchema.optional(),
  issued: crossrefDateSchema.optional(),
  created: crossrefDateSchema.optional(),
  "container-title": z.array(crossrefTextSchema).max(8).readonly().optional(),
  type: z.string().max(128).optional(),
  author: z.array(crossrefAuthorSchema).max(500).readonly().optional(),
  ISSN: z.array(z.string().max(64)).max(32).readonly().optional(),
  publisher: z.string().max(1_024).optional(),
  URL: crossrefUrlSchema.optional()
}).readonly();

export const crossrefSearchEnvelopeSchema = z.object({
  status: z.literal("ok"),
  "message-type": z.literal("work-list"),
  "message-version": z.string().min(1).max(32),
  message: z.object({
    "next-cursor": crossrefCursorSchema,
    items: z.array(crossrefWorkSchema).max(20).readonly()
  }).readonly()
}).readonly();

export const crossrefWorkEnvelopeSchema = z.object({
  status: z.literal("ok"),
  "message-type": z.literal("work"),
  "message-version": z.string().min(1).max(32),
  message: crossrefWorkSchema
}).readonly();

export type CrossrefWork = z.infer<typeof crossrefWorkSchema>;
