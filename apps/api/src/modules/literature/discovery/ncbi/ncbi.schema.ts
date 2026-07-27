import { z } from "zod";

const pmidSchema = z.string().regex(/^\d{1,16}$/u);
const numericStringSchema = z.string().regex(/^\d+$/u);
const boundedTextSchema = z.string().max(64 * 1024);
const xmlScalarSchema = z.union([z.string(), z.number()]).transform(String);
const xmlTextNodeSchema = z.union([
  xmlScalarSchema,
  z.looseObject({ "#text": xmlScalarSchema }).readonly()
]);
const xmlFlexibleTextSchema = z.union([
  xmlScalarSchema,
  z.looseObject({ "#text": xmlScalarSchema.optional() }).readonly()
]);

const pubMedHeaderSchema = z.object({
  type: z.string().max(32),
  version: z.string().max(32)
}).readonly();

export const pubMedSearchResponseSchema = z.object({
  header: pubMedHeaderSchema,
  esearchresult: z.object({
    count: numericStringSchema,
    retmax: numericStringSchema,
    retstart: numericStringSchema,
    idlist: z.array(pmidSchema).max(20).readonly()
  }).readonly()
}).readonly();

const pubMedSummaryAuthorSchema = z.object({
  name: z.string().max(1_024),
  authtype: z.string().max(64),
  clusterid: z.string().max(128)
}).readonly();

const pubMedSummaryArticleIdSchema = z.object({
  idtype: z.string().max(32),
  idtypen: z.number().int().optional(),
  value: z.string().max(1_024)
}).readonly();

export const pubMedSummaryRecordSchema = z.object({
  uid: pmidSchema,
  pubdate: z.string().max(128),
  sortpubdate: z.string().max(64),
  source: z.string().max(1_024),
  authors: z.array(pubMedSummaryAuthorSchema).max(500).readonly(),
  title: boundedTextSchema,
  fulljournalname: z.string().max(1_024),
  issn: z.string().max(64),
  essn: z.string().max(64),
  pubtype: z.array(z.string().max(256)).max(64).readonly(),
  articleids: z.array(pubMedSummaryArticleIdSchema).max(64).readonly(),
  publishername: z.string().max(1_024)
}).readonly();

export const pubMedSummaryResponseSchema = z.object({
  header: pubMedHeaderSchema,
  result: z.record(
    z.string(),
    z.union([
      z.array(pmidSchema).max(20).readonly(),
      pubMedSummaryRecordSchema
    ])
  ).readonly()
}).readonly();

const pubMedXmlIdentifierSchema = z.object({
  "#text": xmlScalarSchema,
  "@_Source": z.string().max(64)
}).readonly();

const pubMedXmlAuthorSchema = z.object({
  LastName: xmlScalarSchema.optional(),
  ForeName: xmlScalarSchema.optional(),
  Initials: xmlScalarSchema.optional(),
  CollectiveName: xmlScalarSchema.optional(),
  Identifier: z.union([
    pubMedXmlIdentifierSchema,
    z.array(pubMedXmlIdentifierSchema).max(16).readonly()
  ]).transform((value) => Array.isArray(value) ? value : [value]).optional()
}).readonly();

const pubMedXmlAbstractNodeSchema = z.union([
  xmlScalarSchema,
  z.looseObject({
    "#text": xmlScalarSchema.optional(),
    "@_Label": z.string().max(256).optional()
  }).readonly()
]);

const pubMedXmlAbstractTextSchema = z.union([
  pubMedXmlAbstractNodeSchema,
  z.array(pubMedXmlAbstractNodeSchema).max(100).readonly()
]).transform((value) => Array.isArray(value) ? value : [value]);

const pubMedXmlPublicationTypeSchema = z.union([
  xmlTextNodeSchema,
  z.array(xmlTextNodeSchema).max(64).readonly()
]).transform((value) => Array.isArray(value) ? value : [value]);

const pubMedXmlArticleIdSchema = z.object({
  "#text": xmlScalarSchema,
  "@_IdType": z.string().max(32)
}).readonly();

const pubMedXmlDateSchema = z.object({
  Year: xmlScalarSchema.optional(),
  Month: xmlScalarSchema.optional(),
  Day: xmlScalarSchema.optional(),
  MedlineDate: xmlScalarSchema.optional()
}).readonly();

const pubMedXmlArticleSchema = z.object({
  MedlineCitation: z.object({
    PMID: xmlTextNodeSchema,
    Article: z.object({
      Journal: z.object({
        ISSN: xmlTextNodeSchema.optional(),
        JournalIssue: z.object({
          PubDate: pubMedXmlDateSchema
        }).readonly(),
        Title: xmlScalarSchema
      }).readonly(),
      ArticleTitle: xmlFlexibleTextSchema,
      ELocationID: z.union([
        z.object({
          "#text": xmlScalarSchema,
          "@_EIdType": z.string().max(32),
          "@_ValidYN": z.string().max(8).optional()
        }).readonly(),
        z.array(z.object({
          "#text": xmlScalarSchema,
          "@_EIdType": z.string().max(32),
          "@_ValidYN": z.string().max(8).optional()
        }).readonly()).max(16).readonly()
      ]).transform((value) => Array.isArray(value) ? value : [value]).optional(),
      Abstract: z.object({
        AbstractText: pubMedXmlAbstractTextSchema
      }).readonly().optional(),
      AuthorList: z.object({
        Author: z.union([
          pubMedXmlAuthorSchema,
          z.array(pubMedXmlAuthorSchema).max(500).readonly()
        ]).transform((value) => Array.isArray(value) ? value : [value])
      }).readonly().optional(),
      PublicationTypeList: z.object({
        PublicationType: pubMedXmlPublicationTypeSchema
      }).readonly().optional(),
      ArticleDate: z.union([
        pubMedXmlDateSchema,
        z.array(pubMedXmlDateSchema).max(16).readonly()
      ]).transform((value) => Array.isArray(value) ? value : [value]).optional()
    }).readonly(),
    MedlineJournalInfo: z.object({
      ISSNLinking: xmlScalarSchema.optional()
    }).readonly().optional()
  }).readonly(),
  PubmedData: z.object({
    ArticleIdList: z.object({
      ArticleId: z.union([
        pubMedXmlArticleIdSchema,
        z.array(pubMedXmlArticleIdSchema).max(64).readonly()
      ]).transform((value) => Array.isArray(value) ? value : [value])
    }).readonly()
  }).readonly()
}).readonly();

export const pubMedFetchResponseSchema = z.object({
  PubmedArticleSet: z.object({
    PubmedArticle: z.union([
      pubMedXmlArticleSchema,
      z.array(pubMedXmlArticleSchema).max(20).readonly()
    ]).transform((value) => Array.isArray(value) ? value : [value])
  }).readonly()
}).readonly();

const pmcLinkSchema = z.object({
  "@_format": z.enum(["pdf", "tgz"]),
  "@_updated": z.string().min(1).max(64),
  "@_href": z.string().min(1).max(4_096)
}).readonly();

const pmcRecordSchema = z.object({
  link: z.union([
    pmcLinkSchema,
    z.array(pmcLinkSchema).max(16).readonly()
  ]).transform((value) => Array.isArray(value) ? value : [value]),
  "@_id": z.string().regex(/^PMC\d{1,16}$/u),
  "@_license": z.string().min(1).max(256),
  "@_retracted": z.enum(["yes", "no"])
}).readonly();

export const pmcResponseSchema = z.object({
  OA: z.object({
    error: z.union([
      z.string().max(1_024),
      z.looseObject({ "#text": z.string().max(1_024) }).readonly()
    ]).optional(),
    records: z.object({
      record: z.union([
        pmcRecordSchema,
        z.array(pmcRecordSchema).max(4).readonly()
      ]).transform((value) => Array.isArray(value) ? value : [value]).optional(),
      "@_returned-count": numericStringSchema,
      "@_total-count": numericStringSchema
    }).readonly().optional()
  }).readonly()
}).readonly();

export type PubMedSearchResponse = z.infer<typeof pubMedSearchResponseSchema>;
export type PubMedSummaryRecord = z.infer<typeof pubMedSummaryRecordSchema>;
export type PubMedFetchArticle = z.infer<typeof pubMedXmlArticleSchema>;
export type PubMedXmlAuthor = z.infer<typeof pubMedXmlAuthorSchema>;
export type PubMedXmlDate = z.infer<typeof pubMedXmlDateSchema>;
export type PmcLink = z.infer<typeof pmcLinkSchema>;
export type PmcResponse = z.infer<typeof pmcResponseSchema>;
