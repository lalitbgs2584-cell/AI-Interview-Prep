"use client";

import React, { FC } from "react";
import { AnimBar, C, Panel, PanelHeader, SkillRow } from "./feedback-core-components";
import { scoreColor } from "./feedback-shared";

interface AudioAnalyticsPanelProps {
  analytics: Record<string, any>;
  scorePillars: Record<string, number>;
}

export const AudioAnalyticsPanel: FC<AudioAnalyticsPanelProps> = ({
  analytics,
  scorePillars,
}) => {
  const filler = analytics?.filler || {};
  const flow = analytics?.flow || {};
  const confidence = analytics?.confidence_signals || {};
  const acoustic = analytics?.acoustic || {};
  const conciseness = analytics?.conciseness_score;
  const coverage = analytics?.concept_coverage;

  const hasData = Object.keys(filler).length > 0 || Object.keys(flow).length > 0;
  if (!hasData) return null;

  const metrics = [
    { label: "WPM", value: flow.wpm ? Math.round(flow.wpm) : "--", unit: "wpm", good: flow.wpm >= 120 && flow.wpm <= 165, desc: "Target: 120-165" },
    { label: "Filler Words", value: filler.count ?? 0, unit: "used", good: (filler.count ?? 0) < 5, desc: `Density: ${filler.density ?? 0}/100w` },
    { label: "Confidence", value: confidence.score ?? 0, unit: "%", good: (confidence.score ?? 0) >= 65, desc: `${confidence.hedges ?? 0} hedges` },
    { label: "Vocal Stability", value: confidence.vocal_stability ?? 0, unit: "%", good: (confidence.vocal_stability ?? 0) >= 65, desc: `Decisiveness: ${confidence.decisiveness ?? 0}%` },
    { label: "Flow", value: flow.consistency ?? 0, unit: "%", good: (flow.consistency ?? 0) >= 65, desc: `${flow.long_pauses ?? 0} long pauses` },
    { label: "Latency", value: flow.latency_ms ?? 0, unit: "ms", good: (flow.latency_ms ?? 9999) < 2000, desc: "Time to first word" },
  ];

  return (
    <div style={{ marginTop: 12, padding: "14px 16px", borderRadius: 12, background: "rgba(34,211,238,0.03)", border: "1px solid rgba(34,211,238,0.12)" }}>
      <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#22d3ee", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
        Audio Analytics
      </div>

      {scorePillars && Object.keys(scorePillars).length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 12 }}>
          {[
            { k: "content_score", l: "Content", c: C.accent },
            { k: "delivery_score", l: "Delivery", c: C.sky },
            { k: "confidence_score", l: "Confidence", c: C.amber },
            { k: "communication_flow_score", l: "Flow", c: C.green },
          ].map(({ k, l, c }) => scorePillars[k] !== undefined && (
            <div key={k} style={{ textAlign: "center", padding: "8px 4px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: c, fontFamily: "'DM Mono', monospace" }}>{scorePillars[k]}</div>
              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", marginTop: 1 }}>{l}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
        {metrics.map((metric) => (
          <div key={metric.label} style={{ padding: "8px 10px", borderRadius: 8, background: metric.good ? "rgba(16,185,129,0.06)" : "rgba(239,68,68,0.06)", border: `1px solid ${metric.good ? "rgba(16,185,129,0.18)" : "rgba(239,68,68,0.18)"}` }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{metric.label}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: metric.good ? C.green : C.rose, fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>
              {metric.value}
              {metric.unit !== "wpm" && metric.unit !== "ms" && metric.unit !== "used" ? "%" : ""}
              <span style={{ fontSize: 9, opacity: 0.6 }}> {metric.unit !== "%" ? metric.unit : ""}</span>
            </div>
            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", marginTop: 2 }}>{metric.desc}</div>
          </div>
        ))}
      </div>

      {(conciseness !== undefined || coverage !== undefined) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
          {conciseness !== undefined && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'DM Mono', monospace" }}>Conciseness</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: scoreColor(conciseness), fontFamily: "'DM Mono', monospace" }}>{conciseness}%</span>
              </div>
              <AnimBar score={conciseness} color={scoreColor(conciseness)} />
            </div>
          )}
          {coverage !== undefined && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'DM Mono', monospace" }}>Concept Coverage</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: scoreColor(coverage), fontFamily: "'DM Mono', monospace" }}>{coverage}%</span>
              </div>
              <AnimBar score={coverage} color={scoreColor(coverage)} />
            </div>
          )}
        </div>
      )}

      {acoustic && (acoustic.rms_mean > 0 || acoustic.rms_std > 0) && (
        <div style={{ paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: "rgba(255,255,255,0.2)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
            Acoustic Signals
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[
              { l: "Energy (RMS)", v: acoustic.rms_mean?.toFixed(4) },
              { l: "Voice Stability", v: acoustic.rms_std?.toFixed(4) },
              { l: "Speaking", v: acoustic.speaking_ms ? `${(acoustic.speaking_ms / 1000).toFixed(1)}s` : null },
            ]
              .filter((entry) => entry.v !== null && entry.v !== undefined)
              .map(({ l, v }) => (
                <div key={l} style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                  <span style={{ color: "rgba(255,255,255,0.2)" }}>{l}: </span>
                  <span style={{ fontFamily: "'DM Mono', monospace", color: "#22d3ee" }}>{v}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {filler.top_terms?.length > 0 && (
        <div style={{ paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.05)", marginTop: 6 }}>
          <div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: "rgba(255,255,255,0.2)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Top Filler Terms
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {filler.top_terms.map((term: string, index: number) => (
              <span key={index} style={{ padding: "2px 7px", borderRadius: 99, fontSize: 10, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: C.rose, fontFamily: "'DM Mono', monospace" }}>
                "{term}"
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface GapPanelProps {
  gap: {
    repeated_gaps?: string[];
    weak_dimensions?: string[];
    dim_averages?: Record<string, number>;
  };
}

export const GapPanel: FC<GapPanelProps> = ({ gap }) => {
  if (!gap) return null;
  const hasGaps = gap.repeated_gaps?.length;
  const hasWeak = gap.weak_dimensions?.length;
  const hasDimensions = Object.keys(gap.dim_averages || {}).length > 0;
  if (!hasGaps && !hasWeak && !hasDimensions) return null;

  return (
    <Panel accent>
      <PanelHeader title="Gap Analysis" sub="Systemic patterns across all questions" />
      {hasGaps && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
            Repeated Gaps
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {gap.repeated_gaps?.map((entry, index) => (
              <span key={index} style={{ padding: "4px 12px", borderRadius: 99, fontSize: 11, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: C.rose }}>
                {entry}
              </span>
            ))}
          </div>
        </div>
      )}
      {hasWeak && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
            Weak Dimensions
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {gap.weak_dimensions?.map((entry, index) => (
              <span key={index} style={{ padding: "4px 12px", borderRadius: 99, fontSize: 11, background: "rgba(255,92,53,0.1)", border: "1px solid rgba(255,92,53,0.25)", color: C.accent2 }}>
                {entry}
              </span>
            ))}
          </div>
        </div>
      )}
      {hasDimensions && (
        <div>
          <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
            Dimension Averages (0"10)
          </div>
          {Object.entries(gap.dim_averages || {}).map(([dimension, avg], index) => (
            <SkillRow key={dimension} label={dimension.replace(/_/g, " ")} score={(avg as number) * 10} delay={index * 0.05} color={scoreColor((avg as number) * 10)} />
          ))}
        </div>
      )}
    </Panel>
  );
};
