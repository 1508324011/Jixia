import type { AIUsageAggregateResponse, AIUsageAggregateView, AIUsageMetricView } from "@jixia/shared";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import { apiFetch } from "../../lib/api";
import { Button, EmptyState, Field, MetaGrid, Notice, Pane, SurfaceHeader, Toolbar, WorkbenchSurface } from "../layout/workbench";

type AIUsagePageProps = {
  readonly onBackToSettings?: () => void;
};

type UsageWindow = {
  readonly periodStart: string;
  readonly periodEnd: string;
};

export function AIUsagePage({ onBackToSettings }: AIUsagePageProps) {
  const defaultWindow = useMemo(createDefaultUsageWindow, []);
  const [usageWindow, setUsageWindow] = useState<UsageWindow>(defaultWindow);
  const [myUsage, setMyUsage] = useState<AIUsageAggregateView | null>(null);
  const [spaceUsage, setSpaceUsage] = useState<AIUsageAggregateView | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [spaceState, setSpaceState] = useState<"idle" | "loading" | "ready" | "unavailable" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [spaceMessage, setSpaceMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadMyUsage(defaultWindow);
  }, [defaultWindow]);

  async function loadMyUsage(windowValue: UsageWindow): Promise<void> {
    setLoadState("loading");
    setMessage(null);

    try {
      const response = await apiFetch<AIUsageAggregateResponse>(usagePath("/ai/usage/me", windowValue));
      setMyUsage(response.usage);
      setLoadState("ready");
    } catch (error) {
      setLoadState("error");
      setMessage(error instanceof Error ? error.message : "Unable to load your AI usage summary.");
    }
  }

  async function loadSpaceUsage(windowValue: UsageWindow): Promise<void> {
    setSpaceState("loading");
    setSpaceMessage(null);

    try {
      const response = await apiFetch<AIUsageAggregateResponse>(usagePath("/ai/usage/space", windowValue));
      setSpaceUsage(response.usage);
      setSpaceState("ready");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unable to load Space AI usage summary.";
      setSpaceUsage(null);
      setSpaceState(errorMessage.toLowerCase().includes("spaceadmin") ? "unavailable" : "error");
      setSpaceMessage(errorMessage);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void loadMyUsage(usageWindow);
    if (spaceState === "ready") {
      void loadSpaceUsage(usageWindow);
    }
  }

  return (
    <WorkbenchSurface aria-labelledby="ai-usage-title" width="wide">
      <SurfaceHeader
        actions={onBackToSettings ? <Button onClick={onBackToSettings}>← Setting</Button> : null}
        description="This page asks the API for aggregate token and cost totals only. It does not request or render prompts, responses, selected context bodies, raw provider payloads, credentials, or per-call rows."
        eyebrow="Aggregate-only usage"
        title="AI usage summaries without sensitive call details."
        titleId="ai-usage-title"
      />

      <form onSubmit={handleSubmit}>
        <Toolbar>
        <Field label="Period start" style={{ flex: "1 1 220px" }}>
          <input
            onChange={(event) => setUsageWindow({ ...usageWindow, periodStart: event.currentTarget.value })}
            required
            type="datetime-local"
            value={usageWindow.periodStart}
          />
        </Field>
        <Field label="Period end" style={{ flex: "1 1 220px" }}>
          <input
            onChange={(event) => setUsageWindow({ ...usageWindow, periodEnd: event.currentTarget.value })}
            required
            type="datetime-local"
            value={usageWindow.periodEnd}
          />
        </Field>
        <Button disabled={loadState === "loading"} type="submit" variant="primary">
          {loadState === "loading" ? "Loading…" : "Refresh my usage"}
        </Button>
        <Button
          disabled={spaceState === "loading"}
          onClick={() => void loadSpaceUsage(usageWindow)}
        >
          {spaceState === "loading" ? "Loading…" : "Load Space aggregate"}
        </Button>
        </Toolbar>
      </form>

      {message ? (
        <Notice role="alert" tone="danger">
          {message}
        </Notice>
      ) : null}

      <div style={usageGridStyle}>
        <UsageSummaryCard title="My aggregate usage" usage={myUsage} loading={loadState === "loading"} />
        <Pane aria-labelledby="space-usage-title" eyebrow="SpaceAdmin authorized" title="Space aggregate usage" titleId="space-usage-title">
          {spaceMessage ? (
            <Notice role={spaceState === "error" ? "alert" : "status"} tone={spaceState === "error" ? "danger" : "info"}>
              {spaceMessage}
            </Notice>
          ) : null}
          <UsageMetrics usage={spaceUsage} loading={spaceState === "loading"} />
        </Pane>
      </div>
    </WorkbenchSurface>
  );
}

type UsageSummaryCardProps = {
  readonly loading: boolean;
  readonly title: string;
  readonly usage: AIUsageAggregateView | null;
};

function UsageSummaryCard({ loading, title, usage }: UsageSummaryCardProps) {
  const titleId = headingId(title);

  return (
    <Pane aria-labelledby={titleId} eyebrow="Server aggregate" title={title} titleId={titleId}>
      <UsageMetrics loading={loading} usage={usage} />
    </Pane>
  );
}

type UsageMetricsProps = {
  readonly loading: boolean;
  readonly usage: AIUsageAggregateView | null;
};

function UsageMetrics({ loading, usage }: UsageMetricsProps) {
  if (loading) {
    return <p className="jixia-description">Loading aggregate usage…</p>;
  }

  if (!usage) {
    return <EmptyState title="No aggregate usage summary loaded" />;
  }

  const totals = totalMetrics(usage.metrics);

  return (
    <div style={metricsLayoutStyle}>
      <MetaGrid
        items={[
          { label: "Scope", value: usage.scope === "user" ? "My usage" : "Space total" },
          { label: "Total tokens", value: formatInteger(totals.totalTokens) },
          { label: "Estimated cost", value: formatMicros(totals.estimatedCostMicros) },
          { label: "Period", value: `${formatDate(usage.periodStart)} → ${formatDate(usage.periodEnd)}` }
        ]}
      />

      {usage.metrics.length === 0 ? (
        <EmptyState title="The API returned no provider/model totals for this period" />
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={tableHeaderStyle}>Provider</th>
              <th style={tableHeaderStyle}>Model</th>
              <th style={tableHeaderStyle}>Prompt tokens</th>
              <th style={tableHeaderStyle}>Completion tokens</th>
              <th style={tableHeaderStyle}>Total tokens</th>
              <th style={tableHeaderStyle}>Estimated cost</th>
            </tr>
          </thead>
          <tbody>
            {usage.metrics.map((metric) => (
              <tr key={`${metric.provider}/${metric.model}`}>
                <td style={tableCellStyle}>{metric.provider}</td>
                <td style={tableCellStyle}>{metric.model}</td>
                <td style={tableCellStyle}>{formatInteger(metric.promptTokens)}</td>
                <td style={tableCellStyle}>{formatInteger(metric.completionTokens)}</td>
                <td style={tableCellStyle}>{formatInteger(metric.totalTokens)}</td>
                <td style={tableCellStyle}>{formatMicros(metric.estimatedCostMicros)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function usagePath(path: string, usageWindow: UsageWindow): string {
  const params = new URLSearchParams({
    periodStart: localDateTimeToIso(usageWindow.periodStart),
    periodEnd: localDateTimeToIso(usageWindow.periodEnd)
  });

  return `${path}?${params.toString()}`;
}

function createDefaultUsageWindow(): UsageWindow {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

  return {
    periodStart: toDateTimeLocalValue(start),
    periodEnd: toDateTimeLocalValue(end)
  };
}

function toDateTimeLocalValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function localDateTimeToIso(value: string): string {
  return new Date(value).toISOString();
}

function totalMetrics(metrics: readonly AIUsageMetricView[]): AIUsageMetricView {
  return metrics.reduce(
    (total, metric) => ({
      provider: "all",
      model: "all",
      promptTokens: total.promptTokens + metric.promptTokens,
      completionTokens: total.completionTokens + metric.completionTokens,
      totalTokens: total.totalTokens + metric.totalTokens,
      estimatedCostMicros: total.estimatedCostMicros + metric.estimatedCostMicros
    }),
    {
      provider: "all",
      model: "all",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostMicros: 0
    }
  );
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function formatMicros(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4
  }).format(value / 1_000_000);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value)
  );
}

function headingId(title: string): string {
  return `${title.toLowerCase().replace(/\s+/g, "-")}-title`;
}

const usageGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
  gap: "18px",
  alignItems: "start"
};

const metricsLayoutStyle = {
  display: "grid",
  gap: "14px"
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "13px"
} as const;

const tableHeaderStyle = {
  borderBottom: "1px solid #dbe5ed",
  color: "#334e68",
  fontSize: "12px",
  padding: "9px 8px",
  textAlign: "left"
} as const;

const tableCellStyle = {
  borderBottom: "1px solid #edf2f7",
  color: "#334155",
  padding: "10px 8px"
};
