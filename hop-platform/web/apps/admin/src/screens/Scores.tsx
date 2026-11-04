import { useState } from "react";
import type { ScreenProps } from "../AdminApp";
import { num, useLoad, type Tone } from "../lib";
import type { Finance } from "../types";
import { Badge, Chips, Empty, Note, Skeleton, useNotify } from "../ui";

// Same bands as safetyScore in backend/internal/app/ops.go.
const tone = (score: number): Tone => (score >= 80 ? "ok" : score >= 60 ? "plain" : "bad");

export default function Scores(_: ScreenProps) {
  const notify = useNotify();
  const { data } = useLoad<Finance>("/api/operator/finance", notify);
  const [filter, setFilter] = useState("all");
  if (!data) return <Skeleton />;
  const risky = data.driver_safety.filter((d) => d.score < 60);
  const rows = (filter === "all" ? data.driver_safety : risky).slice().sort((a, b) => a.score - b.score);
  return (
    <>
      <Chips label="Filter" value={filter} onChange={setFilter} items={[["all", "All captains"], ["risk", "Needs attention", risky.length]]} />
      <section className="card flush">
        {rows.length ? (
          <div className="table-wrap">
            <table className="tbl responsive">
              <thead><tr><th>Captain</th><th>Score</th><th className="num">Trips</th><th className="num">Rating</th><th className="num">Cancellations</th><th className="num">Incidents</th></tr></thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.driver_id}>
                    <td className="lead"><strong>{d.name}</strong></td>
                    <td data-label="Score"><span className="row" style={{ gap: 8, flexWrap: "nowrap" }}><strong>{d.score}</strong><Badge tone={tone(d.score)}>{d.label}</Badge></span></td>
                    <td data-label="Trips" className="num">{num(d.completed_trips)}</td>
                    <td data-label="Rating" className="num">{d.rating_avg ? `${Number(d.rating_avg).toFixed(1)} ★` : "—"}</td>
                    <td data-label="Cancellations" className="num">{d.cancellations}</td>
                    <td data-label="Incidents" className="num">{d.incidents}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title={filter === "all" ? "No approved captains yet" : "No captains need attention"} />}
      </section>
      <Note>Lowest scores first. A score starts at 100 and drops for cancellations after accepting and incident reports in the last 90 days, and for an average rating under 4.5. Contact captains marked “Needs attention” (under 60).</Note>
    </>
  );
}
