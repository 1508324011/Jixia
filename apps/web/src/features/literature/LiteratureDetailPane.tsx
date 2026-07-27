import type {
  GetLiteratureResponse,
  LiteratureAuthorValue,
  LiteratureAssertionHistoryDTO,
  LiteratureFieldProjectionDTO,
  LiteratureIdentifierValue,
  LiteratureOpenAccessValue,
  LiteraturePublisherValue,
  ProviderRecordDTO
} from "@jixia/shared";
import { useEffect, useMemo, useState } from "react";

import { apiFetch } from "../../lib/api";
import { Button, EmptyState, Notice, StatusStrip } from "../layout/workbench";
import type { LiteratureLibraryCopy } from "./literature-library.copy";

type LiteratureDetailPaneProps = {
  readonly copy: LiteratureLibraryCopy;
  readonly literatureId: string | null;
  readonly scopeKey: string;
};

type DetailState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading"; readonly requestKey: string }
  | { readonly detail: GetLiteratureResponse; readonly kind: "ready"; readonly requestKey: string }
  | { readonly kind: "error"; readonly message: string; readonly requestKey: string };

export function LiteratureDetailPane({ copy, literatureId, scopeKey }: LiteratureDetailPaneProps) {
  const { retry, state } = useLiteratureDetail(copy.detailErrorFallback, literatureId, scopeKey);

  switch (state.kind) {
    case "idle":
      return <EmptyState description={copy.selectLiteratureDescription} title={copy.selectLiterature} />;
    case "loading":
      return <StatusStrip>{copy.detailLoading}</StatusStrip>;
    case "error":
      return (
        <Notice role="alert" tone="danger">
          {state.message} <Button onClick={retry} variant="link">{copy.retryDetail}</Button>
        </Notice>
      );
    case "ready":
      return <LoadedLiteratureDetail copy={copy} detail={state.detail} />;
  }
}

function LoadedLiteratureDetail({ copy, detail }: { readonly copy: LiteratureLibraryCopy; readonly detail: GetLiteratureResponse }) {
  const providerRecords = useMemo(() => new Map(detail.providerRecords.map((record) => [record.id, record])), [detail.providerRecords]);

  return (
    <div className="jixia-literature-detail">
      <section aria-labelledby="literature-server-projection" className="jixia-literature-detail__section">
        <h3 id="literature-server-projection">{copy.serverProjection}</h3>
        <div className="jixia-literature-detail__projection" aria-labelledby="literature-server-projection">
          {detail.conflictKinds.length > 0 ? (
            <StatusStrip
              aria-label={copy.conflicts}
              items={[
                copy.conflictCount(detail.conflictKinds.length),
                detail.conflictKinds.map((kind) => copy.assertionKinds[kind]).join(", ")
              ]}
            />
          ) : null}
          <ProjectionField copy={copy} formatValue={formatScalarValue} label={copy.assertionKinds.title} projection={detail.projection.title} providerRecords={providerRecords} />
          <ProjectionField copy={copy} formatValue={formatScalarValue} label={copy.assertionKinds.abstract} projection={detail.projection.abstract} providerRecords={providerRecords} />
          <ProjectionField copy={copy} formatValue={formatScalarValue} label={copy.assertionKinds.publicationYear} projection={detail.projection.publicationYear} providerRecords={providerRecords} />
          <ProjectionField copy={copy} formatValue={formatScalarValue} isDoi label={copy.assertionKinds.doi} projection={detail.projection.doi} providerRecords={providerRecords} />
          <ProjectionField copy={copy} formatValue={formatScalarValue} label={copy.assertionKinds.publicationDate} projection={detail.projection.publicationDate} providerRecords={providerRecords} />
          <ProjectionField copy={copy} formatValue={formatScalarValue} label={copy.assertionKinds.venue} projection={detail.projection.venue} providerRecords={providerRecords} />
          <ProjectionField copy={copy} formatValue={formatScalarValue} label={copy.assertionKinds.publicationType} projection={detail.projection.publicationType} providerRecords={providerRecords} />
          <ProjectionField copy={copy} formatValue={formatAuthors} label={copy.assertionKinds.authors} projection={detail.projection.authors} providerRecords={providerRecords} />
          <ProjectionField copy={copy} formatValue={formatIdentifiers} label={copy.assertionKinds.identifiers} projection={detail.projection.identifiers} providerRecords={providerRecords} />
          <ProjectionField copy={copy} formatValue={(value) => formatOpenAccess(value, copy)} label={copy.assertionKinds.openAccess} projection={detail.projection.openAccess} providerRecords={providerRecords} />
          <ProjectionField copy={copy} formatValue={(value) => formatPublisher(value, copy.unavailable)} label={copy.assertionKinds.publisher} projection={detail.projection.publisher} providerRecords={providerRecords} />
        </div>
      </section>

      <section className="jixia-literature-detail__section">
        <h3>{copy.provenance}</h3>
        <ul className="jixia-literature-detail__provider-list">
          {detail.providerRecords.map((record) => <li key={record.id}>{providerLabel(record, copy.unavailable)}</li>)}
        </ul>
      </section>

      <section className="jixia-literature-detail__section">
        <h3>{copy.assertionHistory}</h3>
        <ul className="jixia-literature-detail__assertion-list">
          {detail.assertions?.map((assertion) => (
            <li key={assertion.assertionId}>
              <strong>{copy.assertionKinds[assertion.kind]}</strong>
              <span>{formatAssertionValue(assertion, copy)}</span>
              <small>{providerLabel(providerRecords.get(assertion.providerRecordId), copy.unavailable)}</small>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ProjectionField<TValue>({
  copy,
  formatValue,
  isDoi = false,
  label,
  projection,
  providerRecords
}: {
  readonly copy: LiteratureLibraryCopy;
  readonly formatValue: (value: TValue) => string;
  readonly isDoi?: boolean;
  readonly label: string;
  readonly projection: LiteratureFieldProjectionDTO<TValue>;
  readonly providerRecords: ReadonlyMap<string, ProviderRecordDTO>;
}) {
  const conflictTitle = isDoi ? copy.doiConflicts : `${label} ${copy.conflicts}`;
  return (
    <section className="jixia-literature-detail__field">
      <h3>{label}</h3>
      {projection.current ? <ProvenancedValue formatValue={formatValue} label={copy.current} providerRecords={providerRecords} unavailable={copy.unavailable} value={projection.current} /> : <span>{copy.unavailable}</span>}
      {projection.history.map((value) => <ProvenancedValue formatValue={formatValue} key={value.assertionId} providerRecords={providerRecords} unavailable={copy.unavailable} value={value} />)}
      {projection.conflicts.length > 0 ? (
        <section className="jixia-literature-detail__conflicts">
          <h4>{conflictTitle}</h4>
          {projection.conflicts.map((value) => <ProvenancedValue formatValue={formatValue} key={value.assertionId} providerRecords={providerRecords} unavailable={copy.unavailable} value={value} />)}
        </section>
      ) : null}
    </section>
  );
}

function ProvenancedValue<TValue>({
  formatValue,
  label,
  providerRecords,
  unavailable,
  value
}: {
  readonly formatValue: (value: TValue) => string;
  readonly label?: string;
  readonly providerRecords: ReadonlyMap<string, ProviderRecordDTO>;
  readonly unavailable: string;
  readonly value: { readonly providerRecordId: string; readonly value: TValue };
}) {
  return (
    <p className="jixia-literature-detail__value">
      {label ? <strong>{label}</strong> : null}
      <span>{formatValue(value.value)}</span>
      <small>{providerLabel(providerRecords.get(value.providerRecordId), unavailable)}</small>
    </p>
  );
}

function useLiteratureDetail(errorFallback: string, literatureId: string | null, scopeKey: string): { readonly retry: () => void; readonly state: DetailState } {
  const [state, setState] = useState<DetailState>({ kind: "idle" });
  const [requestVersion, setRequestVersion] = useState(0);
  const requestKey = literatureId === null ? null : JSON.stringify([scopeKey, literatureId]);

  useEffect(() => {
    if (literatureId === null || requestKey === null) {
      setState({ kind: "idle" });
      return;
    }

    const controller = new AbortController();
    setState({ kind: "loading", requestKey });
    void apiFetch<GetLiteratureResponse>(`/literature/${encodeURIComponent(literatureId)}`, { signal: controller.signal })
      .then((detail) => {
        if (!controller.signal.aborted) setState({ kind: "ready", detail, requestKey });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            kind: "error",
            message: cause instanceof Error ? cause.message : errorFallback,
            requestKey
          });
        }
      });

    return () => controller.abort();
  }, [errorFallback, literatureId, requestKey, requestVersion]);

  const visibleState = requestKey === null
    ? { kind: "idle" } as const
    : state.kind !== "idle" && state.requestKey === requestKey
      ? state
      : { kind: "loading", requestKey } as const;

  return { retry: () => setRequestVersion((version) => version + 1), state: visibleState };
}

function formatAssertionValue(assertion: LiteratureAssertionHistoryDTO, copy: LiteratureLibraryCopy): string {
  switch (assertion.kind) {
    case "title":
    case "abstract":
    case "doi":
    case "publicationDate":
    case "venue":
    case "publicationType":
      return assertion.value;
    case "publicationYear":
      return String(assertion.value);
    case "authors":
      return formatAuthors(assertion.value);
    case "identifiers":
      return formatIdentifiers(assertion.value);
    case "openAccess":
      return formatOpenAccess(assertion.value, copy);
    case "publisher":
      return formatPublisher(assertion.value, copy.unavailable);
  }
}

function formatScalarValue(value: string | number): string {
  return String(value);
}

function formatAuthors(value: readonly LiteratureAuthorValue[]): string {
  return value.map((author) => author.orcid ? `${author.displayName} (${author.orcid})` : author.displayName).join(", ");
}

function formatIdentifiers(value: readonly LiteratureIdentifierValue[]): string {
  return value.map((identifier) => `${identifier.scheme}: ${identifier.value}`).join(", ");
}

function formatOpenAccess(value: LiteratureOpenAccessValue, copy: LiteratureLibraryCopy): string {
  const parts = [value.isOpenAccess ? copy.openAccess : copy.closedAccess];
  if (value.bestUrl !== undefined) parts.push(value.bestUrl);
  if (value.license !== undefined) parts.push(`${copy.license}: ${value.license}`);
  if (value.version !== undefined) parts.push(`${copy.version}: ${value.version}`);
  if (value.hostType !== undefined) parts.push(`${copy.hostType}: ${value.hostType}`);
  return parts.join(" · ");
}

function formatPublisher(value: LiteraturePublisherValue, unavailable: string): string {
  return [value.name, value.landingPageUrl].filter((part): part is string => Boolean(part)).join(" · ") || unavailable;
}

function providerLabel(record: ProviderRecordDTO | undefined, unavailable: string): string {
  return record ? `${record.providerKey} · ${record.recordKey}` : unavailable;
}
