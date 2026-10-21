"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  History,
  Save,
  Wrench
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

type OperationalState = {
  id: string;
  asset_type: string;
  asset_type_name: string;
  status: string;
  condition: string;
  maintenance_priority: string;
};

type Inspection = {
  id: string;
  inspected_at: string;
  inspector_name: string | null;
  condition: string;
  notes: string | null;
};

type MaintenanceRecord = {
  id: string;
  maintenance_type: string;
  scheduled_for: string | null;
  completed_at: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

type OperationsResponse = {
  asset: OperationalState;
  inspections: Inspection[];
  maintenance: MaintenanceRecord[];
  demo_notice: string;
};

type Mode = "state" | "inspection" | "maintenance" | null;

const conditions = ["unknown", "good", "fair", "poor", "critical"];
const statuses = [
  "unknown",
  "active",
  "attention",
  "maintenance_planned",
  "out_of_service"
];
const priorities = ["unassigned", "low", "medium", "high", "critical"];

function pretty(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

export default function AssetOperations({
  assetId,
  onStateChange
}: {
  assetId: string;
  onStateChange?: (state: OperationalState) => void;
}) {
  const [data, setData] = useState<OperationsResponse | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  const [status, setStatus] = useState("unknown");
  const [condition, setCondition] = useState("unknown");
  const [priority, setPriority] = useState("unassigned");

  const [inspectionCondition, setInspectionCondition] = useState("good");
  const [inspector, setInspector] = useState("");
  const [inspectionPriority, setInspectionPriority] = useState("unassigned");
  const [inspectionNotes, setInspectionNotes] = useState("");

  const [maintenanceType, setMaintenanceType] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [maintenanceStatus, setMaintenanceStatus] = useState("planned");
  const [maintenanceNotes, setMaintenanceNotes] = useState("");

  const load = async () => {
    const response = await fetch(`${API_URL}/assets/${assetId}/operations`);
    if (!response.ok) throw new Error(`Operations API returned ${response.status}`);
    const result = (await response.json()) as OperationsResponse;
    setData(result);
    setStatus(result.asset.status || "unknown");
    setCondition(result.asset.condition || "unknown");
    setPriority(result.asset.maintenance_priority || "unassigned");
    onStateChange?.(result.asset);
  };

  useEffect(() => {
    setData(null);
    setMode(null);
    setFeedback("");
    load().catch((error) => {
      console.error(error);
      setFeedback("Operational records could not be loaded.");
    });
  }, [assetId]);

  const runAction = async (request: () => Promise<Response>, successMessage: string) => {
    setBusy(true);
    setFeedback("");
    try {
      const response = await request();
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `Request failed with ${response.status}`);
      }
      await load();
      setFeedback(successMessage);
      setMode(null);
    } catch (error) {
      console.error(error);
      setFeedback("Could not save the operational record.");
    } finally {
      setBusy(false);
    }
  };

  const saveState = (event: FormEvent) => {
    event.preventDefault();
    void runAction(
      () =>
        fetch(`${API_URL}/assets/${assetId}/operations`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            condition,
            maintenance_priority: priority
          })
        }),
      "Operational state updated."
    );
  };

  const addInspection = (event: FormEvent) => {
    event.preventDefault();
    void runAction(
      () =>
        fetch(`${API_URL}/assets/${assetId}/inspections`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            condition: inspectionCondition,
            inspector_name: inspector.trim() || null,
            maintenance_priority: inspectionPriority,
            notes: inspectionNotes.trim() || null
          })
        }),
      "Inspection recorded."
    ).then(() => {
      setInspectionNotes("");
      setInspector("");
    });
  };

  const addMaintenance = (event: FormEvent) => {
    event.preventDefault();
    void runAction(
      () =>
        fetch(`${API_URL}/assets/${assetId}/maintenance`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            maintenance_type: maintenanceType.trim(),
            scheduled_for: scheduledFor || null,
            status: maintenanceStatus,
            notes: maintenanceNotes.trim() || null
          })
        }),
      "Maintenance record created."
    ).then(() => {
      setMaintenanceType("");
      setScheduledFor("");
      setMaintenanceNotes("");
    });
  };

  if (!data) {
    return (
      <section className="operations-card">
        <div className="operations-heading">
          <Wrench size={14} />
          <strong>Demo operations</strong>
        </div>
        <p className="operations-muted">{feedback || "Loading operational records…"}</p>
      </section>
    );
  }

  return (
    <section className="operations-card">
      <div className="operations-heading">
        <Wrench size={14} />
        <strong>Demo operations</strong>
        <span>Portfolio workflow</span>
      </div>

      <p className="demo-notice">{data.demo_notice}</p>

      <div className="operations-state">
        <StatePill label="Status" value={data.asset.status} />
        <StatePill label="Condition" value={data.asset.condition} />
        <StatePill label="Priority" value={data.asset.maintenance_priority} />
      </div>

      <div className="operations-actions">
        <button type="button" onClick={() => setMode(mode === "state" ? null : "state")}>
          <Save size={13} /> State
        </button>
        <button type="button" onClick={() => setMode(mode === "inspection" ? null : "inspection")}>
          <ClipboardCheck size={13} /> Inspect
        </button>
        <button type="button" onClick={() => setMode(mode === "maintenance" ? null : "maintenance")}>
          <Wrench size={13} /> Maintain
        </button>
      </div>

      {mode === "state" && (
        <form className="operations-form" onSubmit={saveState}>
          <label>
            Asset status
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              {statuses.map((item) => <option key={item} value={item}>{pretty(item)}</option>)}
            </select>
          </label>
          <label>
            Condition
            <select value={condition} onChange={(event) => setCondition(event.target.value)}>
              {conditions.map((item) => <option key={item} value={item}>{pretty(item)}</option>)}
            </select>
          </label>
          <label>
            Maintenance priority
            <select value={priority} onChange={(event) => setPriority(event.target.value)}>
              {priorities.map((item) => <option key={item} value={item}>{pretty(item)}</option>)}
            </select>
          </label>
          <button className="operations-submit" disabled={busy} type="submit">
            <Save size={13} /> {busy ? "Saving…" : "Save state"}
          </button>
        </form>
      )}

      {mode === "inspection" && (
        <form className="operations-form" onSubmit={addInspection}>
          <label>
            Condition observed
            <select value={inspectionCondition} onChange={(event) => setInspectionCondition(event.target.value)}>
              {conditions.filter((item) => item !== "unknown").map((item) => <option key={item} value={item}>{pretty(item)}</option>)}
            </select>
          </label>
          <label>
            Inspector
            <input
              value={inspector}
              maxLength={120}
              onChange={(event) => setInspector(event.target.value)}
              placeholder="Name or team (optional)"
            />
          </label>
          <label>
            Priority after inspection
            <select value={inspectionPriority} onChange={(event) => setInspectionPriority(event.target.value)}>
              {priorities.map((item) => <option key={item} value={item}>{pretty(item)}</option>)}
            </select>
          </label>
          <label>
            Notes
            <textarea
              value={inspectionNotes}
              maxLength={1200}
              onChange={(event) => setInspectionNotes(event.target.value)}
              placeholder="Inspection observations…"
            />
          </label>
          <button className="operations-submit" disabled={busy} type="submit">
            <ClipboardCheck size={13} /> {busy ? "Saving…" : "Record inspection"}
          </button>
        </form>
      )}

      {mode === "maintenance" && (
        <form className="operations-form" onSubmit={addMaintenance}>
          <label>
            Maintenance type
            <input
              required
              minLength={2}
              maxLength={120}
              value={maintenanceType}
              onChange={(event) => setMaintenanceType(event.target.value)}
              placeholder="e.g. Preventive inspection"
            />
          </label>
          <label>
            Scheduled date
            <input type="date" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} />
          </label>
          <label>
            Record status
            <select value={maintenanceStatus} onChange={(event) => setMaintenanceStatus(event.target.value)}>
              {["planned", "in_progress", "completed", "cancelled"].map((item) => (
                <option key={item} value={item}>{pretty(item)}</option>
              ))}
            </select>
          </label>
          <label>
            Notes
            <textarea
              value={maintenanceNotes}
              maxLength={1200}
              onChange={(event) => setMaintenanceNotes(event.target.value)}
              placeholder="Work scope or maintenance notes…"
            />
          </label>
          <button className="operations-submit" disabled={busy} type="submit">
            <Wrench size={13} /> {busy ? "Saving…" : "Create maintenance record"}
          </button>
        </form>
      )}

      {feedback && <p className="operations-feedback"><CheckCircle2 size={12} />{feedback}</p>}

      <div className="history-block">
        <div className="history-title"><History size={12} /> Recent history</div>

        {data.inspections.length === 0 && data.maintenance.length === 0 ? (
          <p className="operations-muted">No demo inspection or maintenance records yet.</p>
        ) : (
          <div className="history-list">
            {data.inspections.slice(0, 4).map((item) => (
              <div className="history-item" key={item.id}>
                <span className="history-kind inspection">Inspection</span>
                <strong>{pretty(item.condition)}</strong>
                <small>{formatDate(item.inspected_at)}{item.inspector_name ? ` · ${item.inspector_name}` : ""}</small>
                {item.notes && <p>{item.notes}</p>}
              </div>
            ))}
            {data.maintenance.slice(0, 4).map((item) => (
              <div className="history-item" key={item.id}>
                <span className="history-kind maintenance">Maintenance</span>
                <strong>{item.maintenance_type}</strong>
                <small>{pretty(item.status)} · {formatDate(item.scheduled_for || item.created_at)}</small>
                {item.notes && <p>{item.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function StatePill({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{pretty(value || "unknown")}</strong>
    </div>
  );
}
