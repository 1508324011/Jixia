import type { LiteratureDiscoveryCandidateDTO, LiteratureDiscoveryProviderStatusDTO } from "@jixia/shared";
import { ArrowRight, ExternalLink } from "lucide-react";

import type { LiteratureSearchCopy } from "./literature-search.copy";
import { Button, EmptyState, Notice, Pane, Pill } from "../layout/workbench";

type LiteratureSearchResultsProps = {
  readonly candidates: readonly LiteratureDiscoveryCandidateDTO[];
  readonly copy: LiteratureSearchCopy;
  readonly hasNextPage: boolean;
  readonly isLoading: boolean;
  readonly onNextPage: () => void;
  readonly onSelect: (candidate: LiteratureDiscoveryCandidateDTO) => void;
  readonly providerStatuses: readonly LiteratureDiscoveryProviderStatusDTO[];
  readonly selectedCandidate: LiteratureDiscoveryCandidateDTO | null;
  readonly state: "idle" | "loading" | "ready" | "error";
};

export function LiteratureSearchResults({
  candidates,
  copy,
  hasNextPage,
  isLoading,
  onNextPage,
  onSelect,
  providerStatuses,
  selectedCandidate,
  state
}: LiteratureSearchResultsProps) {
  if (state === "idle") return <EmptyState description={copy.startDescription} title={copy.startTitle} />;
  if (state === "loading" && candidates.length === 0) return <p className="jixia-description" role="status">{copy.searching}</p>;
  if (state === "ready" && candidates.length === 0) return <EmptyState description={copy.emptyDescription} title={copy.emptyTitle} />;

  return (
    <Pane actions={hasNextPage ? <Button disabled={isLoading} onClick={onNextPage}><ArrowRight aria-hidden="true" size={16} /> {copy.nextPage}</Button> : null} title={copy.results}>
      <ProviderNotices copy={copy} providerStatuses={providerStatuses} />
      <p className="jixia-description">{copy.previousSearch}</p>
      <div aria-label={copy.results} className="literature-search__results">
        {candidates.map((candidate) => {
          const title = candidate.title ?? copy.unknownTitle;
          const selected = candidate === selectedCandidate;
          return (
            <button
              aria-label={title}
              aria-pressed={selected}
              className="literature-search__result"
              key={candidateKey(candidate)}
              onClick={() => onSelect(candidate)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(candidate);
                }
              }}
              type="button"
            >
              <span className="literature-search__result-heading">
                <strong>{title}</strong>
                {candidate.openAccess === undefined || candidate.openAccess === null ? (
                  <Pill>{copy.unknownAccess}</Pill>
                ) : candidate.openAccess.isOpenAccess ? (
                  <Pill tone="success">{copy.openAccess}</Pill>
                ) : (
                  <Pill>{copy.closedAccess}</Pill>
                )}
              </span>
              <span>{formatMetadata(candidate)}</span>
              {candidate.abstract ? <span className="literature-search__abstract">{candidate.abstract}</span> : null}
              {candidate.openAccess?.bestUrl ? <span className="literature-search__link"><ExternalLink aria-hidden="true" size={14} /> {candidate.openAccess.bestUrl}</span> : null}
            </button>
          );
        })}
      </div>
    </Pane>
  );
}

function ProviderNotices({ copy, providerStatuses }: Pick<LiteratureSearchResultsProps, "copy" | "providerStatuses">) {
  if (providerStatuses.length === 0) return null;
  const hasPartialResults = providerStatuses.some((status) => status.status !== "succeeded");
  return (
    <div className="literature-search__provider-notices">
      {hasPartialResults ? <Notice role="alert" tone="warning">{copy.providersPartial}</Notice> : null}
      {providerStatuses.map((status) => {
        const presentation = providerNoticePresentation(status);
        return <Notice key={status.providerKey} role={presentation.role} tone={presentation.tone}>{providerMessage(copy, status)}</Notice>;
      })}
    </div>
  );
}

function candidateKey(candidate: LiteratureDiscoveryCandidateDTO): string {
  return candidate.sourceMatches.map((match) => `${match.providerKey}:${match.recordKey}`).join("|") || candidate.doi || candidate.title || "unknown";
}

function formatMetadata(candidate: LiteratureDiscoveryCandidateDTO): string {
  const authors = candidate.authors.map((author) => author.displayName).join(", ");
  return [authors, candidate.publicationYear, candidate.venue, candidate.doi].filter((value) => Boolean(value)).join(" · ");
}

function providerMessage(copy: LiteratureSearchCopy, status: LiteratureDiscoveryProviderStatusDTO): string {
  const provider = status.providerKey.charAt(0).toUpperCase() + status.providerKey.slice(1);
  switch (status.status) {
    case "succeeded":
      return copy.providerSucceeded(provider, status.resultCount);
    case "rate_limited":
      return copy.providerRateLimited(provider, status.retryAfterSeconds);
    case "unavailable":
      return copy.providerUnavailable(provider, status.failureCode);
    case "unconfigured":
      return copy.providerUnconfigured(provider);
  }
}

function providerNoticePresentation(status: LiteratureDiscoveryProviderStatusDTO): { readonly role: "status" | "alert"; readonly tone: "success" | "warning" } {
  switch (status.status) {
    case "succeeded":
      return { role: "status", tone: "success" };
    case "rate_limited":
    case "unavailable":
    case "unconfigured":
      return { role: "alert", tone: "warning" };
  }
}
