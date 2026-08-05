"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReportPreviewChart } from "@/lib/records/reports";

export function ExchangeTimingChart({
  rows,
}: {
  rows: Array<{ date: string; minutesEarlyOrLate: number | null; status: string }>;
}) {
  const outcomeOrder = [
    "completed_on_time",
    "completed_early",
    "completed_late",
    "missed",
    "refused",
    "modified_by_agreement",
    "canceled",
    "other",
  ];
  const outcomeColors: Record<string, string> = {
    completed_on_time: "#0f766e",
    completed_early: "#2563eb",
    completed_late: "#b45309",
    missed: "#b91c1c",
    refused: "#be123c",
    modified_by_agreement: "#7c3aed",
    canceled: "#64748b",
    other: "#475569",
  };
  const outcomeRows = outcomeOrder
    .map((status) => ({
      status,
      label: status.replace("completed_", "").replaceAll("_", " "),
      count: rows.filter((row) => row.status === status).length,
    }))
    .filter((row) => row.count > 0);
  const timedRows = rows.filter(
    (row): row is typeof row & { minutesEarlyOrLate: number } =>
      typeof row.minutesEarlyOrLate === "number"
  );
  const chartAttributes = {
    "data-testid": "exchange-timing-chart",
    "data-exchange-count": String(rows.length),
    "data-timed-count": String(timedRows.length),
    "data-outcomes": outcomeRows.map((row) => `${row.status}:${row.count}`).join(","),
  };

  if (rows.length === 0) {
    return (
      <div {...chartAttributes}>
        <ChartEmpty label="No exchange records in this range." />
      </div>
    );
  }

  return (
    <div className="min-w-0" {...chartAttributes}>
      <p className="text-xs leading-5 text-slate-600">
        All {rows.length} saved exchange{rows.length === 1 ? " is" : "s are"} included below, even when an actual time was not recorded.
      </p>
      <div className="mt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Saved outcomes</h4>
        <ResponsiveContainer width="100%" height={Math.max(170, outcomeRows.length * 42)} minWidth={0}>
          <BarChart data={outcomeRows} layout="vertical" margin={{ left: 20, right: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
            <YAxis dataKey="label" type="category" tick={{ fontSize: 11 }} width={112} />
            <Tooltip />
            <Bar dataKey="count" name="Saved exchanges" radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {outcomeRows.map((row) => (
                <Cell key={row.status} fill={outcomeColors[row.status] || outcomeColors.other} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-5 border-t border-slate-200 pt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Minutes early or late</h4>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Positive values are late; negative values are early. On-time exchanges receive a visible baseline mark.
        </p>
        {timedRows.length > 0 ? (
          <ResponsiveContainer width="100%" height={220} minWidth={0}>
            <BarChart data={timedRows} margin={{ top: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <ReferenceLine y={0} stroke="#64748b" />
              <Bar
                dataKey="minutesEarlyOrLate"
                name="Minutes early or late"
                radius={[4, 4, 0, 0]}
                minPointSize={5}
                isAnimationActive={false}
              >
                {timedRows.map((row, index) => (
                  <Cell
                    key={`${row.date}-${index}`}
                    fill={row.minutesEarlyOrLate > 0 ? "#b45309" : row.minutesEarlyOrLate < 0 ? "#2563eb" : "#0f766e"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="mt-3">
            <ChartEmpty label="Add an actual date and time to graph early or late minutes. Saved outcomes are still graphed above." />
          </div>
        )}
      </div>
    </div>
  );
}

export function SupportPaymentChart({
  rows,
}: {
  rows: Array<{ month: string; amountDue: number; amountPaid: number; unpaidBalance: number }>;
}) {
  if (rows.length === 0) return <ChartEmpty label="No calculated child support obligations in this range." />;

  return (
    <ResponsiveContainer width="100%" height={260} minWidth={0}>
      <AreaChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area
          type="monotone"
          dataKey="amountDue"
          name="Amount due"
          stroke="#334155"
          fill="#cbd5e1"
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="amountPaid"
          name="Amount paid"
          stroke="#0f766e"
          fill="#99f6e4"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ExpenseCategoryChart({
  rows,
}: {
  rows: Array<{ category: string; amount: number }>;
}) {
  const chartAttributes = {
    "data-testid": "expense-category-chart",
    "data-category-count": String(rows.length),
    "data-categories": rows.map((row) => row.category).join(","),
    "data-total": String(rows.reduce((total, row) => total + row.amount, 0)),
  };

  if (rows.length === 0) {
    return (
      <div {...chartAttributes}>
        <ChartEmpty label="No expense records saved yet." />
      </div>
    );
  }

  return (
    <div className="min-w-0" {...chartAttributes}>
      <ResponsiveContainer width="100%" height={240} minWidth={0}>
        <BarChart data={rows} layout="vertical" margin={{ left: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis dataKey="category" type="category" tick={{ fontSize: 11 }} width={92} />
          <Tooltip />
          <Bar
            dataKey="amount"
            name="Expense amount"
            fill="#f59e0b"
            radius={[0, 4, 4, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SupportTrendLine({
  rows,
}: {
  rows: Array<{ month: string; amountDue: number; amountPaid: number; unpaidBalance: number }>;
}) {
  const chartAttributes = {
    "data-testid": "support-history-chart",
    "data-month-count": String(rows.length),
    "data-months": rows.map((row) => row.month).join(","),
  };

  if (rows.length === 0) {
    return (
      <div {...chartAttributes}>
        <ChartEmpty label="No monthly payment rows yet." />
      </div>
    );
  }

  return (
    <div className="min-w-0" {...chartAttributes}>
      <ResponsiveContainer width="100%" height={220} minWidth={0}>
        <LineChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="amountDue"
            name="Due"
            stroke="#334155"
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="amountPaid"
            name="Paid"
            stroke="#0f766e"
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="unpaidBalance"
            name="Unpaid balance based on records"
            stroke="#b45309"
            strokeWidth={2}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const reportSeries = [
  { key: "value", color: "#0f766e", dash: undefined },
  { key: "secondaryValue", color: "#2563eb", dash: "4 3" },
  { key: "tertiaryValue", color: "#b45309", dash: "2 3" },
] as const;

export function ReportPreviewChartCard({ chart }: { chart: ReportPreviewChart }) {
  const rows = chart.rows.filter((row) =>
    [row.value, row.secondaryValue, row.tertiaryValue].some((value) => typeof value === "number" && value !== 0)
  );

  const activeSeries = reportSeries.filter((series) =>
    chart.rows.some((row) => typeof row[series.key] === "number")
  );

  return (
    <div className="report-chart-card rounded-md border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">{chart.title}</h3>
          {chart.description && <p className="mt-1 text-xs leading-5 text-slate-500">{chart.description}</p>}
        </div>
        {chart.unit && <span className="text-xs font-medium text-slate-500">{chart.unit}</span>}
      </div>
      <div className="mt-3">
        {chart.rows.length === 0 ? (
          <ChartEmpty label={chart.emptyLabel || "No chart data for this range."} />
        ) : rows.length === 0 ? (
          <ChartEmpty label={chart.emptyLabel || "No chart values above zero in this range."} />
        ) : chart.kind === "line" ? (
          <ResponsiveContainer width="100%" height={260} minWidth={0}>
            <LineChart data={chart.rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {activeSeries.map((series, index) => (
                <Line
                  key={series.key}
                  type="monotone"
                  dataKey={series.key}
                  name={chart.seriesLabels?.[index] || series.key}
                  stroke={series.color}
                  strokeWidth={2}
                  strokeDasharray={series.dash}
                  dot={{ r: 3 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : chart.orientation === "horizontal" ? (
          <ResponsiveContainer width="100%" height={260} minWidth={0}>
            <BarChart data={chart.rows} layout="vertical" margin={{ left: 24, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis dataKey="label" type="category" tick={{ fontSize: 11 }} width={128} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {activeSeries.map((series, index) => (
                <Bar
                  key={series.key}
                  dataKey={series.key}
                  name={chart.seriesLabels?.[index] || series.key}
                  fill={series.color}
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={260} minWidth={0}>
            <BarChart data={chart.rows} margin={{ left: 4, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {activeSeries.map((series, index) => (
                <Bar
                  key={series.key}
                  dataKey={series.key}
                  name={chart.seriesLabels?.[index] || series.key}
                  fill={series.color}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="grid h-[220px] place-items-center rounded-md border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
      {label}
    </div>
  );
}
