"use client";
import { useEffect, useState } from "react";
import { SkillCategoryBars, SkillConstellation } from "./skills-visuals";

// "" Types """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

type Skill = {
  id:       string;
  name:     string;
  category: string;
};

type StatEntry = { label: string; score: number } | null;

interface SkillsInsights {
  skills:             Skill[];
  strongest:          StatEntry;
  weakest:            StatEntry;
  overallAvg:         number | null;
  categoryAverages:   Record<string, number>;
  upcomingSkills:     string[];
  totalInterviews:    number;
  interviewsCovered:  string[];
}

// "" Helpers """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

function scoreColor(score: number): string {
  if (score >= 75) return "var(--positive, #00e5b0)";
  if (score >= 50) return "var(--gold, #e2a84b)";
  return "var(--rose, #f76a6a)";
}

function scoreLabel(score: number): string {
  if (score >= 80) return "Strong";
  if (score >= 65) return "Good";
  if (score >= 50) return "Average";
  return "Needs Work";
}

// "" Skeleton """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

function Skeleton({ h = 48, w = "100%" }: { h?: number; w?: string }) {
  return (
    <div style={{
      height:     h,
      width:      w,
      borderRadius: "var(--r-lg, 10px)",
      background: "var(--card-2)",
      animation:  "pulse 1.5s ease-in-out infinite",
    }} />
  );
}

// "" Score bar """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "0.82rem", color: "var(--text-2)", fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: "0.78rem", fontFamily: "var(--ff-mono)", color: scoreColor(score), fontWeight: 600 }}>
          {score} / 100
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: "var(--card-2, rgba(255,255,255,0.06))", overflow: "hidden" }}>
        <div style={{
          height:     "100%",
          width:      `${score}%`,
          borderRadius: 99,
          background: scoreColor(score),
          transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
        }} />
      </div>
    </div>
  );
}

// "" Main component """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""

export default function SkillsPage() {
  const [data,    setData]    = useState<SkillsInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/skills-insights`,{
          credentials:"include",
        });
        if (!res.ok) throw new Error("Failed");
        const json: SkillsInsights = await res.json();
        setData(json);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Group skills by category
  const grouped = (data?.skills ?? []).reduce<Record<string, Skill[]>>((acc, skill) => {
    const cat = skill.category ?? "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(skill);
    return acc;
  }, {});

  const hasInterviewData = data && Object.keys(data.categoryAverages).length > 0;
  const skillList = data?.skills ?? [];

  return (
    <>
      <style>{`@keyframes pulse { 0%,100%{opacity:.5} 50%{opacity:.2} }`}</style>

      {/* "" Top bar "" */}
      <div className="dash-topbar">
        <div>
          <div className="dash-greeting">Skill <em>Breakdown</em></div>
          <div className="dash-date">Your proficiency across all interview categories</div>
        </div>
      </div>

      {/* "" Stat cards "" */}
      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>

        {/* Strongest */}
        <div className="dash-stat-card anim-0">
          <div className="dash-stat-top">
            <span className="stat-card-dot dot-gold" />
            <span className="dash-stat-label">Strongest Area</span>
          </div>
          {loading ? (
            <Skeleton h={32} />
          ) : data?.strongest ? (
            <>
              <div className="dash-stat-value" style={{ fontSize: "1.2rem" }}>{data.strongest.label}</div>
              <div className="dash-stat-delta">Score: {data.strongest.score} / 100</div>
            </>
          ) : (
            <>
              <div className="dash-stat-value" style={{ fontSize: "1rem", color: "var(--text-3)" }}>No data yet</div>
              <div className="dash-stat-delta">Complete an interview to see this</div>
            </>
          )}
        </div>

        {/* Needs work */}
        <div className="dash-stat-card anim-1">
          <div className="dash-stat-top">
            <span className="stat-card-dot dot-accent" />
            <span className="dash-stat-label">Needs Most Work</span>
          </div>
          {loading ? (
            <Skeleton h={32} />
          ) : data?.weakest ? (
            <>
              <div className="dash-stat-value" style={{ fontSize: "1.2rem" }}>{data.weakest.label}</div>
              <div className="dash-stat-delta">Score: {data.weakest.score} / 100</div>
            </>
          ) : (
            <>
              <div className="dash-stat-value" style={{ fontSize: "1rem", color: "var(--text-3)" }}>No data yet</div>
              <div className="dash-stat-delta">Complete an interview to see this</div>
            </>
          )}
        </div>

        {/* Overall avg */}
        <div className="dash-stat-card anim-2">
          <div className="dash-stat-top">
            <span className="stat-card-dot dot-violet" />
            <span className="dash-stat-label">Overall Average</span>
          </div>
          {loading ? (
            <Skeleton h={32} />
          ) : data?.overallAvg !== null && data?.overallAvg !== undefined ? (
            <>
              <div className="dash-stat-value">
                {data.overallAvg}<span className="dash-stat-unit">/ 100</span>
              </div>
              <div className="dash-stat-delta">{scoreLabel(data.overallAvg)} - {data.totalInterviews} interview{data.totalInterviews !== 1 ? "s" : ""} taken</div>
            </>
          ) : (
            <>
              <div className="dash-stat-value" style={{ fontSize: "1rem", color: "var(--text-3)" }}>"</div>
              <div className="dash-stat-delta">No interviews completed yet</div>
            </>
          )}
        </div>
      </div>

      {(loading || hasInterviewData) && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">Skill performance map</div>
              <div className="panel-sub">A cleaner bar view of how each interview category is trending</div>
            </div>
          </div>
          {loading ? (
            <div style={{ display: "grid", gap: "1rem" }}>
              {[...Array(3)].map((_, i) => <Skeleton key={i} h={72} />)}
            </div>
          ) : (
            <SkillCategoryBars categoryAverages={data!.categoryAverages} />
          )}
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Skill constellation</div>
            <div className="panel-sub">A cluster-first view of your resume skills, grouped by the domains they belong to</div>
          </div>
          {!loading && data && (
            <span style={{
              fontFamily: "var(--ff-mono)",
              fontSize: "0.72rem",
              color: "var(--muted)",
              background: "var(--card-2)",
              border: "1px solid var(--border)",
              borderRadius: "999px",
              padding: "0.25rem 0.75rem",
            }}>
              {data.skills.length} skills
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ display: "grid", gap: "1rem" }}>
            {[...Array(2)].map((_, i) => <Skeleton key={i} h={220} />)}
          </div>
        ) : (
          <SkillConstellation skills={skillList} />
        )}
      </div>

      {/* "" Upcoming skills to pursue "" */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Recommended Focus Areas</div>
            <div className="panel-sub">Based on your resume gaps and interview coverage</div>
          </div>
          <span className="tag tag-accent">AI Coach</span>
        </div>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {[...Array(4)].map((_, i) => <Skeleton key={i} h={44} />)}
          </div>
        ) : data && data.upcomingSkills.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {data.upcomingSkills.map((item, i) => (
              <div key={i} style={{
                display:      "flex",
                alignItems:   "center",
                gap:          "0.75rem",
                padding:      "0.75rem 1rem",
                borderRadius: "var(--r-lg, 10px)",
                background:   "var(--card-2)",
                border:       "1px solid var(--border)",
              }}>
                <span style={{
                  width:        28,
                  height:       28,
                  borderRadius: "50%",
                  background:   "rgba(0,229,176,0.08)",
                  border:       "1px solid rgba(0,229,176,0.2)",
                  display:      "flex",
                  alignItems:   "center",
                  justifyContent: "center",
                  fontSize:     "0.75rem",
                  color:        "var(--accent)",
                  fontWeight:   700,
                  flexShrink:   0,
                }}>
                  {i + 1}
                </span>
                <span style={{ fontSize: "0.85rem", color: "var(--text-2)", flex: 1 }}>{item}</span>
                <span style={{ fontSize: "0.72rem", color: "var(--muted)", fontFamily: "var(--ff-mono)" }}>
                  {i === 0 ? "High priority" : i === 1 ? "Medium" : "Low"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: "var(--text-2)", fontSize: "0.85rem" }}>
            Complete more interviews to get personalized recommendations.
          </div>
        )}

        {!loading && (
          <div style={{ marginTop: "1.25rem" }}>
            <button
              className="resume-action-btn primary"
              onClick={() => window.location.href = "/dashboard/resume"}
            >
               Start Recommended Session
            </button>
          </div>
        )}
      </div>

      {/* "" Interview coverage chips "" */}
      {!loading && data && data.interviewsCovered.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">Interview Types Covered</div>
              <div className="panel-sub">{data.interviewsCovered.length} of 4 types practiced</div>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
            {(["Technical", "HR / Behavioral", "System Design", "Behavioral"] as const).map((type) => {
              const covered = data.interviewsCovered.includes(type);
              return (
                <span key={type} style={{
                  padding:      "0.4rem 1rem",
                  borderRadius: "999px",
                  fontSize:     "0.8rem",
                  fontWeight:   600,
                  border:       `1px solid ${covered ? "rgba(0,229,176,0.3)" : "var(--border)"}`,
                  background:   covered ? "rgba(0,229,176,0.07)" : "var(--card-2)",
                  color:        covered ? "var(--accent)" : "var(--text-3)",
                }}>
                  {covered ? "OK " : ""}{type}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
