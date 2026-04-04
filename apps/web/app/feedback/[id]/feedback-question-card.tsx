"use client";

import React, { FC, useState } from "react";
import { AudioAnalyticsPanel } from "./feedback-analytics-components";
import { AnimBar, C, Panel } from "./feedback-core-components";
import { DIFF_COLOR, QuestionScore, scoreColor } from "./feedback-shared";

interface QuestionCardProps {
  q: QuestionScore;
  indexBase: number;
  sessionAnalytics: Record<string, any>;
}

export const QuestionCard: FC<QuestionCardProps> = ({
  q,
  indexBase,
  sessionAnalytics,
}) => {
  const [open, setOpen] = useState(false);
  const color = DIFF_COLOR[q.difficulty] || C.muted;
  const analytics = q.analytics || {};
  const scorePillars = q.score_pillars || {};
  const hasAudio = Object.keys(analytics).length > 0;
  const hasDimensions = q.dimensions && Object.keys(q.dimensions).length > 0;

  return (
    <Panel style={{ marginBottom: 10, padding: 0, overflow: "hidden" }}>
      <div
        onClick={() => setOpen((prev) => !prev)}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 14,
          padding: "16px 20px",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: `${color}15`,
            border: `1px solid ${color}35`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'DM Mono', monospace",
            fontSize: 11,
            fontWeight: 700,
            color,
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          Q{q.index + indexBase}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              color: "rgba(255,255,255,0.85)",
              lineHeight: 1.55,
              fontWeight: 500,
              marginBottom: 6,
            }}
          >
            {q.question}
          </div>

          {q.verdict && q.verdict !== "No feedback available" && (
            <div
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.4)",
                lineHeight: 1.6,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              } as React.CSSProperties}
            >
              {q.verdict}
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: 5,
              marginTop: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color,
                background: `${color}12`,
                padding: "2px 8px",
                borderRadius: 99,
                fontFamily: "'DM Mono', monospace",
              }}
            >
              {q.difficulty}
            </span>
            {hasAudio && (
              <span
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.25)",
                  background: "rgba(34,211,238,0.06)",
                  border: "1px solid rgba(34,211,238,0.15)",
                  padding: "2px 8px",
                  borderRadius: 99,
                  fontFamily: "'DM Mono', monospace",
                }}
              >
                audio
              </span>
            )}
            {q.missing_concepts?.length ? (
              <span
                style={{
                  fontSize: 10,
                  color: C.rose,
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.2)",
                  padding: "2px 8px",
                  borderRadius: 99,
                  fontFamily: "'DM Mono', monospace",
                }}
              >
                {q.missing_concepts.length} gaps
              </span>
            ) : null}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color, fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>
              {q.score}
            </div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", fontFamily: "'DM Mono', monospace" }}>/100</div>
            <div style={{ marginTop: 5, width: 48, height: 3, borderRadius: 99, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${q.score}%`, background: color, borderRadius: 99, transition: "width 0.8s ease" }} />
            </div>
          </div>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ color: "rgba(255,255,255,0.2)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {open && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          {Object.keys(scorePillars).length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
              {[
                { k: "content_score", l: "Content", c: C.accent },
                { k: "delivery_score", l: "Delivery", c: C.sky },
                { k: "confidence_score", l: "Confidence", c: C.amber },
                { k: "communication_flow_score", l: "Flow", c: C.green },
              ].map(({ k, l, c }) => scorePillars[k] !== undefined && (
                <div key={k} style={{ textAlign: "center", padding: "8px 4px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: c, fontFamily: "'DM Mono', monospace" }}>{scorePillars[k]}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>{l}</div>
                </div>
              ))}
            </div>
          )}

          {hasDimensions && (
            <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
                Dimensions (0"10)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {Object.entries(q.dimensions ?? {}).map(([dimension, value]) => (
                  <div key={dimension}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "capitalize" }}>{dimension.replace(/_/g, " ")}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor((value as number) * 10), fontFamily: "'DM Mono', monospace" }}>{value}/10</span>
                    </div>
                    <AnimBar score={(value as number) * 10} color={scoreColor((value as number) * 10)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {q.user_answer && (
            <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.15)" }}>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#34d399", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                Your Answer
              </div>
              <div style={{ fontSize: 13, color: "#d1fae5", lineHeight: 1.75, whiteSpace: "pre-wrap", maxHeight: 240, overflowY: "auto" }}>
                {q.user_answer}
              </div>
            </div>
          )}

          {q.reference_answer && (
            <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(167,139,250,0.04)", border: "1px solid rgba(167,139,250,0.18)" }}>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                Reference Answer
              </div>
              <div style={{ fontSize: 13, color: "#ede9fe", lineHeight: 1.8, whiteSpace: "pre-wrap", maxHeight: 280, overflowY: "auto" }}>
                {q.reference_answer}
              </div>
            </div>
          )}

          {!q.reference_answer && q.expected_answer?.key_concepts?.length ? (
            <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(167,139,250,0.04)", border: "1px solid rgba(167,139,250,0.15)" }}>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                Expected Concepts
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {q.expected_answer.key_concepts.map((concept, index) => (
                  <span key={index} style={{ padding: "3px 9px", borderRadius: 99, fontSize: 11, background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)", color: "#c4b5fd" }}>
                    {concept}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {q.verdict && q.verdict !== "No feedback available" && (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
                Verdict
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.7 }}>{q.verdict}</div>
            </div>
          )}

          {q.missing_concepts?.length ? (
            <div>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: C.rose, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
                Missing Concepts
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {q.missing_concepts.map((concept, index) => (
                  <span key={index} style={{ padding: "3px 9px", borderRadius: 99, fontSize: 11, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: C.rose }}>
                    {concept}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {q.strengths?.length || q.weaknesses?.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {q.strengths?.map((strength, index) => (
                <span key={index} style={{ padding: "3px 9px", borderRadius: 99, fontSize: 11, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", color: C.green }}>
                  {strength}
                </span>
              ))}
              {q.weaknesses?.map((weakness, index) => (
                <span key={index} style={{ padding: "3px 9px", borderRadius: 99, fontSize: 11, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: C.rose }}>
                  {weakness}
                </span>
              ))}
            </div>
          ) : null}

          {hasAudio && <AudioAnalyticsPanel analytics={analytics} scorePillars={scorePillars} />}
          {Object.keys(sessionAnalytics || {}).length === 0 ? null : null}
        </div>
      )}
    </Panel>
  );
};
