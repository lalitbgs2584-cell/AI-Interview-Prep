"use client";

import { useEffect, useState } from "react";
import Topbar from "@/components/layouts/Topbar";
import { fetchAdminSettings, updateAdminSettings, type AdminSettingsResponse } from "@/lib/admin-api";

function SettingRow({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", padding: "1rem 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text)", marginBottom: "2px" }}>{label}</div>
        <div style={{ fontSize: "0.78rem", color: "var(--text-3)", lineHeight: 1.5 }}>{description}</div>
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        width: 40, height: 22, borderRadius: 99,
        background: checked ? "var(--accent)" : "rgba(255,255,255,0.1)",
        border: `1px solid ${checked ? "var(--accent)" : "var(--border-strong)"}`,
        cursor: "pointer", position: "relative", transition: "background 0.2s",
        flexShrink: 0,
      }}
    >
      <div style={{
        position: "absolute", top: 2, left: checked ? 20 : 2,
        width: 16, height: 16, borderRadius: "50%",
        background: "#fff", transition: "left 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
      }} />
    </button>
  );
}

function NumberInput({ value, unit, onChange, step = 1 }: { value: number; unit?: string; onChange: (value: number) => void; step?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{
          width: 72, padding: "0.45rem 0.65rem",
          borderRadius: "var(--r-md)", border: "1px solid var(--border-strong)",
          background: "var(--card-2)", color: "var(--text)",
          fontFamily: "var(--ff-mono)", fontSize: "0.85rem", textAlign: "right",
          outline: "none",
        }}
      />
      {unit && <span style={{ fontFamily: "var(--ff-mono)", fontSize: "0.72rem", color: "var(--muted)" }}>{unit}</span>}
    </div>
  );
}

export default function SettingsPage() {
  const [data, setData] = useState<AdminSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const next = await fetchAdminSettings();
        if (!active) return;
        setData(next);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load settings");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const patchInterview = (patch: Partial<AdminSettingsResponse["interviewConfig"]>) => {
    setData((current) => current ? { ...current, interviewConfig: { ...current.interviewConfig, ...patch } } : current);
  };

  const patchAi = (patch: Partial<AdminSettingsResponse["aiParameters"]>) => {
    setData((current) => current ? { ...current, aiParameters: { ...current.aiParameters, ...patch } } : current);
  };

  const handleSave = async () => {
    if (!data) return;
    setSaving(true);
    setStatus(null);
    setError(null);

    try {
      const next = await updateAdminSettings({
        interviewConfig: data.interviewConfig,
        aiParameters: data.aiParameters,
      });
      setData(next);
      setStatus(`Saved ${new Date(next.updatedAt).toLocaleString("en-IN")}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Topbar title="Settings" />
      <main className="admin-main">
        {error && <div className="panel" style={{ color: "var(--rose)", marginBottom: "1rem" }}>{error}</div>}
        {status && <div className="panel" style={{ color: "var(--positive)", marginBottom: "1rem" }}>{status}</div>}

        <div className="panel anim-0">
          <div className="panel-header">
            <div>
              <div className="panel-title">Interview Configuration</div>
              <div className="panel-sub">controls applied to all new interview sessions</div>
            </div>
            <button className="btn-accent" style={{ padding: "0.55rem 1.1rem", fontSize: "0.8rem" }} onClick={() => void handleSave()} disabled={loading || saving || !data}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <SettingRow label="Questions per session" description="Total questions asked in a standard interview">
              <NumberInput value={data?.interviewConfig.questionsPerSession ?? 0} unit="questions" onChange={(value) => patchInterview({ questionsPerSession: value })} />
            </SettingRow>
            <SettingRow label="Time per question" description="Max seconds a candidate has to answer before auto-skip">
              <NumberInput value={data?.interviewConfig.timePerQuestion ?? 0} unit="seconds" onChange={(value) => patchInterview({ timePerQuestion: value })} />
            </SettingRow>
            <SettingRow label="Default difficulty" description="Starting difficulty level for new sessions">
              <select value={data?.interviewConfig.defaultDifficulty ?? "MEDIUM"} onChange={(event) => patchInterview({ defaultDifficulty: event.target.value as AdminSettingsResponse["interviewConfig"]["defaultDifficulty"] })} style={{ padding: "0.45rem 0.75rem", borderRadius: "var(--r-md)", border: "1px solid var(--border-strong)", background: "var(--card-2)", color: "var(--text)", fontFamily: "var(--ff-mono)", fontSize: "0.8rem", outline: "none" }}>
                <option value="EASY">EASY</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HARD">HARD</option>
              </select>
            </SettingRow>
            <SettingRow label="Allow reattempts" description="Whether candidates can redo an interview within 24h">
              <Toggle checked={data?.interviewConfig.allowReattempts ?? false} onChange={(value) => patchInterview({ allowReattempts: value })} />
            </SettingRow>
          </div>
        </div>

        <div className="panel anim-1">
          <div className="panel-header">
            <div>
              <div className="panel-title">AI Evaluation Parameters</div>
              <div className="panel-sub">tune how the scoring model behaves</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <SettingRow label="Strictness level" description="How harshly the model evaluates incomplete answers (1=lenient, 5=strict)">
              <NumberInput value={data?.aiParameters.strictnessLevel ?? 0} unit="/ 5" onChange={(value) => patchAi({ strictnessLevel: value })} />
            </SettingRow>
            <SettingRow label="Confidence threshold" description="Minimum LLM confidence to accept a score (below = flag for review)">
              <NumberInput value={data?.aiParameters.confidenceThreshold ?? 0} unit="0-1" step={0.1} onChange={(value) => patchAi({ confidenceThreshold: value })} />
            </SettingRow>
            <SettingRow label="Follow-up questions" description="Whether AI generates follow-up questions on vague answers">
              <Toggle checked={data?.aiParameters.followupQuestions ?? false} onChange={(value) => patchAi({ followupQuestions: value })} />
            </SettingRow>
            <SettingRow label="Filler word penalty" description="Deduct score for excessive um/uh/like usage">
              <Toggle checked={data?.aiParameters.fillerWordPenalty ?? false} onChange={(value) => patchAi({ fillerWordPenalty: value })} />
            </SettingRow>
            <SettingRow label="Interruption detection" description="Flag sessions where candidate interrupts AI frequently">
              <Toggle checked={data?.aiParameters.interruptionDetection ?? false} onChange={(value) => patchAi({ interruptionDetection: value })} />
            </SettingRow>
          </div>
        </div>

        <div className="panel anim-2">
          <div className="panel-header">
            <div>
              <div className="panel-title">Question Bank</div>
              <div className="panel-sub">live counts by interview type and difficulty</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "0.75rem" }}>
            {(data?.questionBank ?? []).map((row) => (
              <div key={row.type} style={{ padding: "1rem", borderRadius: "var(--r-lg)", border: "1px solid var(--border)", background: "var(--card-2)" }}>
                <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--accent-2)", marginBottom: "0.65rem" }}>{row.type}</div>
                {[ ["Easy", row.easy], ["Medium", row.medium], ["Hard", row.hard] ].map(([label, count]) => (
                  <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                    <span style={{ color: "var(--text-3)", fontFamily: "var(--ff-mono)" }}>{label}</span>
                    <span style={{ color: "var(--text-2)", fontFamily: "var(--ff-mono)", fontWeight: 500 }}>{count}</span>
                  </div>
                ))}
                <div style={{ marginTop: "0.75rem", paddingTop: "0.6rem", borderTop: "1px solid var(--border)", fontFamily: "var(--ff-mono)", fontSize: "0.7rem", color: "var(--text-3)", textAlign: "right" }}>
                  {row.total} total
                </div>
              </div>
            ))}
            {!loading && !(data?.questionBank?.length) && <div style={{ color: "var(--text-3)", fontSize: "0.82rem" }}>No questions are stored yet.</div>}
          </div>
        </div>
      </main>
    </>
  );
}
