import type { CanonicalAssertionKind, LiteratureImportWarningCode } from "@jixia/shared";

import type { Locale } from "../i18n/locale";

export type LiteratureLibraryCopy = {
  readonly assertionHistory: string;
  readonly assertionKinds: Readonly<Record<CanonicalAssertionKind, string>>;
  readonly closedAccess: string;
  readonly conflictCount: (count: number) => string;
  readonly conflicts: string;
  readonly current: string;
  readonly detailErrorFallback: string;
  readonly detailLoading: string;
  readonly doiConflicts: string;
  readonly emptyPersonal: string;
  readonly emptyProject: string;
  readonly hostType: string;
  readonly importCompletedWithWarnings: string;
  readonly importWarning: (warning: LiteratureImportWarningCode) => string;
  readonly license: string;
  readonly libraryErrorFallback: string;
  readonly literatureDetails: string;
  readonly listLoading: string;
  readonly loadMore: string;
  readonly loadingMore: string;
  readonly openAccess: string;
  readonly personalLibrary: string;
  readonly projectLibrary: string;
  readonly provenance: string;
  readonly retryDetail: string;
  readonly retryLibrary: string;
  readonly scopeProject: string;
  readonly scopePersonal: string;
  readonly selectLiterature: string;
  readonly selectLiteratureDescription: string;
  readonly serverProjection: string;
  readonly unavailable: string;
  readonly untitled: string;
  readonly version: string;
};

const englishImportWarnings = {
  openalex_enrichment_unavailable: "OpenAlex enrichment was unavailable",
  crossref_enrichment_unavailable: "Crossref enrichment was unavailable",
  pubmed_enrichment_unavailable: "PubMed enrichment was unavailable",
  pmc_enrichment_unavailable: "PMC enrichment was unavailable",
  unpaywall_enrichment_unavailable: "Unpaywall enrichment was unavailable"
} as const satisfies Readonly<Record<LiteratureImportWarningCode, string>>;

const simplifiedChineseImportWarnings = {
  openalex_enrichment_unavailable: "OpenAlex 补充信息不可用",
  crossref_enrichment_unavailable: "Crossref 补充信息不可用",
  pubmed_enrichment_unavailable: "PubMed 补充信息不可用",
  pmc_enrichment_unavailable: "PMC 补充信息不可用",
  unpaywall_enrichment_unavailable: "Unpaywall 补充信息不可用"
} as const satisfies Readonly<Record<LiteratureImportWarningCode, string>>;

const englishCopy = {
  assertionHistory: "Assertion history",
  assertionKinds: {
    title: "Title",
    abstract: "Abstract",
    publicationYear: "Publication year",
    doi: "DOI",
    publicationDate: "Publication date",
    venue: "Venue",
    publicationType: "Publication type",
    authors: "Authors",
    identifiers: "Identifiers",
    openAccess: "Open access",
    publisher: "Publisher"
  },
  closedAccess: "Not open access",
  conflictCount: (count) => `${count} ${count === 1 ? "conflict" : "conflicts"}`,
  conflicts: "conflicts",
  current: "Current",
  detailErrorFallback: "Unable to load literature details.",
  detailLoading: "Loading literature details...",
  doiConflicts: "DOI conflicts",
  emptyPersonal: "No personal literature",
  emptyProject: "No project literature",
  hostType: "Host type",
  importCompletedWithWarnings: "Import completed with warnings",
  importWarning: (warning) => englishImportWarnings[warning],
  license: "License",
  libraryErrorFallback: "Unable to load literature.",
  literatureDetails: "Literature details",
  listLoading: "Loading literature...",
  loadMore: "Load more literature",
  loadingMore: "Loading more literature...",
  openAccess: "Open access",
  personalLibrary: "Personal literature",
  projectLibrary: "Project literature",
  provenance: "Provenance",
  retryDetail: "Retry detail load",
  retryLibrary: "Retry library load",
  scopeProject: "Project",
  scopePersonal: "Personal",
  selectLiterature: "Select literature",
  selectLiteratureDescription: "No literature selected.",
  serverProjection: "Current metadata",
  unavailable: "Unavailable",
  untitled: "Untitled literature",
  version: "Version"
} as const satisfies LiteratureLibraryCopy;

const simplifiedChineseCopy = {
  assertionHistory: "断言历史",
  assertionKinds: {
    title: "标题",
    abstract: "摘要",
    publicationYear: "出版年份",
    doi: "DOI",
    publicationDate: "出版日期",
    venue: "期刊或会议",
    publicationType: "出版类型",
    authors: "作者",
    identifiers: "标识符",
    openAccess: "开放获取",
    publisher: "出版方"
  },
  closedAccess: "非开放获取",
  conflictCount: (count) => `${count} 个冲突`,
  conflicts: "存在冲突",
  current: "当前值",
  detailErrorFallback: "无法加载文献详情。",
  detailLoading: "正在加载文献详情...",
  doiConflicts: "DOI 冲突",
  emptyPersonal: "暂无个人文献",
  emptyProject: "暂无项目文献",
  hostType: "托管类型",
  importCompletedWithWarnings: "导入完成，存在警告",
  importWarning: (warning) => simplifiedChineseImportWarnings[warning],
  license: "许可协议",
  libraryErrorFallback: "无法加载文献。",
  literatureDetails: "文献详情",
  listLoading: "正在加载文献...",
  loadMore: "加载更多文献",
  loadingMore: "正在加载更多文献...",
  openAccess: "开放获取",
  personalLibrary: "个人文献",
  projectLibrary: "项目文献",
  provenance: "来源记录",
  retryDetail: "重试加载详情",
  retryLibrary: "重试加载文献",
  scopeProject: "项目",
  scopePersonal: "个人",
  selectLiterature: "选择文献",
  selectLiteratureDescription: "尚未选择文献。",
  serverProjection: "当前元数据",
  unavailable: "不可用",
  untitled: "未命名文献",
  version: "版本"
} as const satisfies LiteratureLibraryCopy;

const copyByLocale = {
  en: englishCopy,
  "zh-CN": simplifiedChineseCopy
} as const satisfies Readonly<Record<Locale, LiteratureLibraryCopy>>;

export function literatureLibraryCopy(locale: Locale): LiteratureLibraryCopy {
  return copyByLocale[locale];
}
