import type { Locale } from "../i18n/locale";

export type LiteratureSearchCopy = {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly question: string;
  readonly questionHint: string;
  readonly search: string;
  readonly searching: string;
  readonly startTitle: string;
  readonly startDescription: string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly results: string;
  readonly nextPage: string;
  readonly previousSearch: string;
  readonly target: string;
  readonly personal: string;
  readonly project: string;
  readonly projectLabel: string;
  readonly projectsLoading: string;
  readonly projectsUnavailable: string;
  readonly retryProjects: string;
  readonly selectProject: string;
  readonly importTitle: string;
  readonly selectResult: string;
  readonly import: string;
  readonly importing: string;
  readonly importExpired: string;
  readonly retry: string;
  readonly importFailed: (failureCode: string) => string;
  readonly imported: string;
  readonly noImportableSource: string;
  readonly openAccess: string;
  readonly closedAccess: string;
  readonly unknownAccess: string;
  readonly unknownTitle: string;
  readonly providersPartial: string;
  readonly providerSucceeded: (provider: string, resultCount: number) => string;
  readonly providerRateLimited: (provider: string, retryAfterSeconds: number | null) => string;
  readonly providerUnavailable: (provider: string, failureCode: string) => string;
  readonly providerUnconfigured: (provider: string) => string;
  readonly searchUnavailable: string;
  readonly importUnavailable: string;
  readonly retryUnavailable: string;
  readonly progressUnavailable: string;
};

const copy: Record<Locale, LiteratureSearchCopy> = {
  en: {
    eyebrow: "Literature discovery",
    title: "Search the literature",
    description: "OpenAlex, Crossref, and PubMed records",
    question: "Research question",
    questionHint: "Concept, author, DOI, or title",
    search: "Search",
    searching: "Searching literature…",
    startTitle: "Start with a research question",
    startDescription: "No search submitted.",
    emptyTitle: "No matching literature records",
    emptyDescription: "Change the question or identifier.",
    results: "Discovery results",
    nextPage: "Next page",
    previousSearch: "Latest results",
    target: "Import destination",
    personal: "Personal library",
    project: "Project library",
    projectLabel: "Project",
    projectsLoading: "Loading projects…",
    projectsUnavailable: "Unable to load projects.",
    retryProjects: "Retry project load",
    selectProject: "Select a project",
    importTitle: "Import selected source",
    selectResult: "No result selected.",
    import: "Import selected source",
    importing: "Importing selected literature",
    importExpired: "Import expired.",
    retry: "Retry import",
    importFailed: (failureCode) => `Import failed: ${failureCode}.`,
    imported: "Import complete.",
    noImportableSource: "No importable provider source is available.",
    openAccess: "Open access",
    closedAccess: "Not open access",
    unknownAccess: "Access status unavailable",
    unknownTitle: "Untitled literature record",
    providersPartial: "Partial provider response.",
    providerSucceeded: (provider, resultCount) => `${provider} returned ${resultCount} result${resultCount === 1 ? "" : "s"}.`,
    providerRateLimited: (provider, retryAfterSeconds) => retryAfterSeconds === null ? `${provider} is rate limited.` : `${provider} is rate limited. Try again in ${retryAfterSeconds} seconds.`,
    providerUnavailable: (provider, failureCode) => `${provider} is unavailable: ${failureCode}.`,
    providerUnconfigured: (provider) => `${provider} is not configured.`,
    searchUnavailable: "Unable to search the literature.",
    importUnavailable: "Unable to import the selected source.",
    retryUnavailable: "Unable to retry the import.",
    progressUnavailable: "Unable to refresh import progress."
  },
  "zh-CN": {
    eyebrow: "文献发现",
    title: "检索文献",
    description: "OpenAlex、Crossref 与 PubMed 文献记录",
    question: "研究问题",
    questionHint: "概念、作者、DOI 或标题",
    search: "检索",
    searching: "正在检索文献…",
    startTitle: "从研究问题开始",
    startDescription: "尚未提交检索。",
    emptyTitle: "没有匹配的文献记录",
    emptyDescription: "更改研究问题或标识符。",
    results: "发现结果",
    nextPage: "下一页",
    previousSearch: "最近结果",
    target: "导入位置",
    personal: "个人文献库",
    project: "项目文献库",
    projectLabel: "项目",
    projectsLoading: "正在加载项目…",
    projectsUnavailable: "无法加载项目。",
    retryProjects: "重新加载项目",
    selectProject: "选择项目",
    importTitle: "导入选中来源",
    selectResult: "尚未选择结果。",
    import: "导入选中来源",
    importing: "正在导入选中文献",
    importExpired: "导入已过期。",
    retry: "重新导入",
    importFailed: (failureCode) => `导入失败：${failureCode}。`,
    imported: "导入完成。",
    noImportableSource: "没有可导入的来源记录。",
    openAccess: "开放获取",
    closedAccess: "非开放获取",
    unknownAccess: "获取状态未知",
    unknownTitle: "未命名文献记录",
    providersPartial: "来源返回部分结果。",
    providerSucceeded: (provider, resultCount) => `${provider} 返回 ${resultCount} 条结果。`,
    providerRateLimited: (provider, retryAfterSeconds) => retryAfterSeconds === null ? `${provider} 已达到请求限制。` : `${provider} 已达到请求限制，请在 ${retryAfterSeconds} 秒后重试。`,
    providerUnavailable: (provider, failureCode) => `${provider} 当前不可用：${failureCode}。`,
    providerUnconfigured: (provider) => `${provider} 尚未配置。`,
    searchUnavailable: "无法检索文献。",
    importUnavailable: "无法导入选中的来源。",
    retryUnavailable: "无法重新导入。",
    progressUnavailable: "无法刷新导入进度。"
  }
};

export function literatureSearchCopy(locale: Locale): LiteratureSearchCopy {
  return copy[locale];
}
