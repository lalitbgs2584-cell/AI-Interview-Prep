'use client';

import './style.css';
import { FC, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
  ReferenceLine,
} from 'recharts';
import { AudioAnalyticsPanel, GapPanel } from './feedback-analytics-components';
import {
  AnimBar,
  C,
  ChartTip,
  Panel,
  PanelHeader,
  ScoreRing,
  SkillRow,
} from './feedback-core-components';
import { QuestionCard } from './feedback-question-card';
import InterviewRecordingGallery from '@/components/recordings/InterviewRecordingGallery';
import { fetchInterviewRecordings, type RecordingItem } from '@/lib/interview-recordings';
import {
  FeedbackCard,
  Skeleton,
  Stat,
  TopBar,
} from './feedback-support-components';
import {
  API_BASE,
  DIFF_COLOR,
  type FeedbackData,
  fmtDate,
  fmtDuration,
} from './feedback-shared';
const FeedbackPage: FC = () => {
  const router = useRouter();
  const params = useParams();
  const interviewId = params.id as string;

  const [data, setData] = useState<FeedbackData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [tab, setTab] = useState<'overview' | 'skills' | 'questions' | 'feedback' | 'audio' | 'recordings'>('overview');
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!interviewId) return;

    const fetchResults = async () => {
      try {
        const [res, recordingItems] = await Promise.all([
          fetch(`${API_BASE}/api/interview/${interviewId}/results`, {
            credentials: 'include',
          }),
          fetchInterviewRecordings(interviewId),
        ]);

        if (res.status === 404) {
          pollRef.current = setTimeout(fetchResults, 3000);
          return;
        }

        if (!res.ok) {
          let detail = `HTTP ${res.status}`;
          try {
            const j = await res.json();
            detail = j?.message ?? j?.error ?? detail;
          } catch {}
          throw new Error(detail);
        }

        let json = (await res.json()) as FeedbackData;

        // Normalize arrays
        json.what_went_right = Array.isArray(json.what_went_right)
          ? json.what_went_right
          : [];
        json.what_went_wrong = Array.isArray(json.what_went_wrong)
          ? json.what_went_wrong
          : [];
        json.strengths = Array.isArray(json.strengths) ? json.strengths : [];
        json.weaknesses = Array.isArray(json.weaknesses) ? json.weaknesses : [];
        json.tips = Array.isArray(json.tips) ? json.tips : [];
        json.question_scores = Array.isArray(json.question_scores)
          ? json.question_scores
          : [];
        json.history = Array.isArray(json.history) ? json.history : [];
        json.skill_scores = json.skill_scores ?? {};
        json.score_pillars = json.score_pillars ?? {};
        json.analytics = json.analytics ?? {};
        json.coaching_priorities = Array.isArray(json.coaching_priorities)
          ? json.coaching_priorities
          : [];
        json.gap_analysis = json.gap_analysis ?? {};

        json.question_scores = json.question_scores.map((q) => ({
          ...q,
          verdict: q.verdict || q.feedback || '',
          feedback: q.feedback || q.verdict || '',
          user_answer: q.user_answer || '',
          dimensions: q.dimensions ?? {},
          analytics: q.analytics ?? {},
          score_pillars: q.score_pillars ?? {},
          missing_concepts: Array.isArray(q.missing_concepts)
            ? q.missing_concepts
            : [],
          strengths: Array.isArray(q.strengths) ? q.strengths : [],
          weaknesses: Array.isArray(q.weaknesses) ? q.weaknesses : [],
        }));

        setData(json);
        setRecordings(recordingItems);
        setLoading(false);
      } catch (e) {
        setError(
          (e instanceof Error ? e.message : 'Unknown error') ||
            'Failed to load results'
        );
        setLoading(false);
      }
    };

    fetchResults();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [interviewId]);

  if (loading) {
    return (
      <div className="fb-root">
        
        <TopBar />
        <div
          style={{
            maxWidth: 1080,
            margin: '0 auto',
            padding: '80px 24px',
            width: '100%',
          }}
        >
          <Skeleton />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: C.bg,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'DM Mono', monospace",
        }}
      >
        
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}> </div>
          <div style={{ color: C.rose, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Derived data
  const qs = data.question_scores;
  const indexBase = qs.length > 0 && qs[0]?.index === 0 ? 1 : 0;
  const skillScores = Object.entries(data.skill_scores).map(([skill, score]) => ({
    skill,
    score,
  }));
  const pillarScores = [
    {
      label: 'Content',
      score: data.score_pillars.content_score ?? 0,
      color: C.accent,
    },
    {
      label: 'Delivery',
      score: data.score_pillars.delivery_score ?? 0,
      color: C.sky,
    },
    {
      label: 'Confidence',
      score: data.score_pillars.confidence_score ?? 0,
      color: C.amber,
    },
    {
      label: 'Flow',
      score: data.score_pillars.communication_flow_score ?? 0,
      color: C.green,
    },
  ];
  const radarData = skillScores.map((s) => ({
    subject: s.skill,
    score: s.score,
  }));
  const timelineData = qs.map((q) => ({
    q: `Q${q.index + indexBase}`,
    score: q.score,
    diff: q.difficulty,
  }));

  const historyData = (data.history || []).map((h, i) => ({
    session: `S${i + 1}`,
    score: h.score,
    id: h.interview_id,
  }));
  if (!historyData.some((h) => h.id === interviewId)) {
    historyData.push({
      session: `S${historyData.length + 1}`,
      score: data.overall_score,
      id: interviewId,
    });
  }
  const prevScore =
    historyData.length >= 2 ? historyData[historyData.length - 2]?.score ?? null : null;
  const delta =
    prevScore !== null ? data.overall_score - prevScore : null;

  const rightItems =
    data.what_went_right.length > 0
      ? data.what_went_right
      : data.strengths.map((s) => ({ point: s, tag: 'Strength' }));
  const wrongItems =
    data.what_went_wrong.length > 0
      ? data.what_went_wrong
      : data.weaknesses.map((w) => ({ point: w, tag: 'Gap' }));

  const filler = data.analytics?.filler_summary ?? {};
  const flow = data.analytics?.flow_summary ?? {};
  const confSum = data.analytics?.confidence_summary ?? {};
  const coverageTrend = Array.isArray(data.analytics?.concept_coverage_trend)
    ? data.analytics.concept_coverage_trend.map((p: any, i: number) => ({
        q: `Q${p.question_order ?? i + 1}`,
        coverage: Number(p.coverage_score ?? 0),
      }))
    : [];

  const diffGroups = ['intro', 'easy', 'medium', 'hard']
    .map((d) => {
      const dqs = qs.filter((q) => q.difficulty === d);
      return {
        phase:
          d.charAt(0).toUpperCase() + d.slice(1),
        count: dqs.length,
        avg:
          dqs.length
            ? Math.round(
                dqs.reduce((s, q) => s + q.score, 0) / dqs.length
              )
            : 0,
        color: DIFF_COLOR[d],
      };
    })
    .filter((d) => d.count > 0);

  const recColor: Record<string, string> = {
    'Strong Hire': C.green,
    Hire: C.sky,
    'No Hire': C.rose,
    'Leaning No Hire': C.amber,
  };
  const recommColor = recColor[data.recommendation] || C.violet;

  const TABS = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'skills' as const, label: 'Skills' },
    { id: 'questions' as const, label: 'Questions' },
    { id: 'feedback' as const, label: 'Feedback' },
    { id: 'audio' as const, label: ' Audio' },
    { id: 'recordings' as const, label: 'Recordings (' + recordings.length + ')' },
  ];

  const qsWithAudio = qs.filter((q) => Object.keys(q.analytics || {}).length > 0);
  const avgWpm =
    qsWithAudio.length
      ? Math.round(
          qsWithAudio.reduce(
            (s, q) => s + (q.analytics?.flow?.wpm ?? 0),
            0
          ) / qsWithAudio.length
        )
      : null;
  const totalFillers = qsWithAudio.reduce(
    (s, q) => s + (q.analytics?.filler?.count ?? 0),
    0
  );
  const avgConf =
    qsWithAudio.length
      ? Math.round(
          qsWithAudio.reduce(
            (s, q) => s + (q.analytics?.confidence_signals?.score ?? 0),
            0
          ) / qsWithAudio.length
        )
      : null;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: C.bg,
        color: '#f0f0f0',
        fontFamily: "'DM Mono', monospace",
      }}
    >
      
      <TopBar router={router} />

      <main className="fb-main">
        {/* HERO */}
        <div className="hero-card" style={{ animation: 'fadeUp 0.5s ease both' }}>
          <div className="hero-shine" />
          <div className="hero-body">
            {/* Left */}
            <div className="hero-meta" style={{ flex: 1, minWidth: 260 }}>
              <div className="hero-badge">
                <div className="hero-badge-dot" style={{ width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: C.accent,
                    boxShadow: `0 0 8px ${C.accent}`,
                  }}
                />
                <span
                  style={{
                    fontSize: 10,
                    color: 'rgba(255,255,255,0.4)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                  }}
                >
                  {data.interview_type.toUpperCase()}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.15)' }}>-</span>
                <span
                  style={{
                    fontSize: 11,
                    color: recommColor,
                    fontWeight: 700,
                  }}
                >
                  {data.recommendation}
                </span>
              </div>
              <h1
                style={{
                  fontSize: 28,
                  fontWeight: 900,
                  color: '#f0f0f0',
                  lineHeight: 1.2,
                  fontFamily: "'Syne', sans-serif",
                  marginBottom: 6,
                }}
              >
                {data.role}
              </h1>
              <div
                style={{
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.3)',
                  marginBottom: 14,
                }}
              >
                {fmtDate(data.date_iso)} - {fmtDuration(data.duration_seconds)}
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: 'rgba(255,255,255,0.5)',
                  lineHeight: 1.8,
                  maxWidth: 480,
                }}
              >
                {data.summary}
              </p>

              {delta !== null && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginTop: 14,
                  }}
                >
                  <span
                    style={{
                      padding: '4px 12px',
                      borderRadius: 99,
                      fontSize: 11,
                      fontWeight: 700,
                      fontFamily: "'DM Mono', monospace",
                      background:
                        delta >= 0
                          ? 'rgba(16,185,129,0.1)'
                          : 'rgba(239,68,68,0.1)',
                      border: `1px solid ${
                        delta >= 0
                          ? 'rgba(16,185,129,0.25)'
                          : 'rgba(239,68,68,0.25)'
                      }`,
                      color: delta >= 0 ? C.green : C.rose,
                    }}
                  >
                    {(delta >= 0 ? "+" : "-")}{Math.abs(delta)} pts vs last session
                  </span>
                  {prevScore !== null && (
                    <span
                      style={{
                        fontSize: 11,
                        color: 'rgba(255,255,255,0.25)',
                      }}
                    >
                      Previous: {prevScore}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Right */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 16,
              }}
            >
              <ScoreRing score={data.overall_score} />
              <div style={{ display: 'flex', gap: 16 }}>
                <Stat
                  val={rightItems.length}
                  label="Strengths"
                  color={C.green}
                />
                <Stat val={wrongItems.length} label="Gaps" color={C.rose} />
                <Stat val={qs.length} label="Questions" color={C.sky} />
              </div>
            </div>
          </div>
        </div>

        {/* TABS */}
        <div className="fb-tabs" style={{ animation: 'fadeUp 0.5s ease 0.1s both' }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`fb-tab ${tab === t.id ? 'active' : ''}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {tab === 'overview' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              animation: 'fadeUp 0.4s ease both',
            }}
          >
            {/* Score pillar cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 12,
              }}
            >
              {pillarScores.map((p, i) => (
                <div
                  key={p.label}
                  style={{
                    padding: '16px 18px',
                    borderRadius: 14,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    animation: `fadeUp 0.4s ease ${i * 0.07}s both`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      color: 'rgba(255,255,255,0.3)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      marginBottom: 8,
                    }}
                  >
                    {p.label}
                  </div>
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 900,
                      color: p.color,
                      fontFamily: "'DM Mono', monospace",
                      lineHeight: 1,
                      marginBottom: 10,
                    }}
                  >
                    {p.score}
                  </div>
                  <AnimBar
                    score={p.score}
                    color={p.color}
                    delay={i * 60}
                  />
                </div>
              ))}
            </div>

            {/* Score history */}
            <Panel>
              <PanelHeader
                title="Score History"
                sub="Performance across sessions"
                right={(() => {
                  if (historyData.length < 2) return undefined;
                  const first = historyData[0];
                  const last = historyData[historyData.length - 1];
                  if (!first || !last) return undefined;
                  const d = last.score - first.score;
                  return (
                    <span
                      style={{
                        padding: '3px 10px',
                        borderRadius: 99,
                        fontSize: 11,
                        fontWeight: 700,
                        fontFamily: "'DM Mono', monospace",
                        color: d >= 0 ? C.green : C.rose,
                        background:
                          d >= 0
                            ? 'rgba(16,185,129,0.1)'
                            : 'rgba(239,68,68,0.1)',
                        border: `1px solid ${
                          d >= 0
                            ? 'rgba(16,185,129,0.25)'
                            : 'rgba(239,68,68,0.25)'
                        }`,
                      }}
                    >
                      {d >= 0 ? '+' : ''}{d} total
                    </span>
                  );
                })()}
              />
              {historyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart
                    data={historyData}
                    margin={{ top: 8, right: 8, bottom: 0, left: -20 }}
                  >
                    <defs>
                      <linearGradient
                        id="ag"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor={C.accent}
                          stopOpacity={0.25}
                        />
                        <stop
                          offset="100%"
                          stopColor={C.accent}
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.04)"
                    />
                    <XAxis
                      dataKey="session"
                      tick={{ fontSize: 10, fill: C.muted }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 10, fill: C.muted }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<ChartTip />} />
                    <Area
                      type="monotone"
                      dataKey="score"
                      name="Score"
                      stroke={C.accent}
                      strokeWidth={2.5}
                      fill="url(#ag)"
                      dot={{ fill: C.accent, r: 4, strokeWidth: 0 }}
                      activeDot={{ r: 6, fill: C.accent }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div
                  style={{
                    textAlign: 'center',
                    color: C.muted,
                    padding: '2rem 0',
                    fontSize: 12,
                  }}
                >
                  First session " history will appear here.
                </div>
              )}
            </Panel>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 16,
              }}
            >
              {/* Skills */}
              <Panel>
                <PanelHeader title="Skills Snapshot" />
                {skillScores.slice(0, 5).map((s, i) => (
                  <SkillRow
                    key={s.skill}
                    label={s.skill}
                    score={s.score}
                    delay={i * 0.06}
                  />
                ))}
                {skillScores.length === 0 && (
                  <div
                    style={{
                      textAlign: 'center',
                      color: C.muted,
                      padding: '1rem',
                      fontSize: 11,
                    }}
                  >
                    No skill data
                  </div>
                )}
              </Panel>

              {/* By difficulty */}
              <Panel>
                <PanelHeader title="Score by Difficulty" />
                {diffGroups.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={diffGroups}
                      margin={{
                        top: 5,
                        right: 5,
                        bottom: 0,
                        left: -25,
                      }}
                      barSize={28}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(255,255,255,0.04)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="phase"
                        tick={{ fontSize: 10, fill: C.muted }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fontSize: 10, fill: C.muted }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<ChartTip />} />
                      <Bar dataKey="avg" name="Avg" radius={[6, 6, 0, 0]}>
                        {diffGroups.map((e) => (
                          <Cell
                            key={e.phase}
                            fill={e.color}
                            fillOpacity={0.9}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div
                    style={{
                      textAlign: 'center',
                      color: C.muted,
                      padding: '2rem 0',
                      fontSize: 11,
                    }}
                  >
                    No data
                  </div>
                )}
              </Panel>
            </div>

            {/* Coverage + speech signals */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 16,
              }}
            >
              <Panel>
                <PanelHeader
                  title="Coverage Trend"
                  sub="Concept coverage per question"
                />
                {coverageTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart
                      data={coverageTrend}
                      margin={{
                        top: 8,
                        right: 12,
                        bottom: 0,
                        left: -20,
                      }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(255,255,255,0.04)"
                      />
                      <XAxis
                        dataKey="q"
                        tick={{ fontSize: 10, fill: C.muted }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fontSize: 10, fill: C.muted }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<ChartTip />} />
                      <ReferenceLine
                        y={70}
                        stroke="rgba(255,92,53,0.2)"
                        strokeDasharray="4 4"
                      />
                      <Line
                        type="monotone"
                        dataKey="coverage"
                        name="Coverage"
                        stroke={C.accent2}
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: C.accent2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div
                    style={{
                      textAlign: 'center',
                      color: C.muted,
                      padding: '2rem 0',
                      fontSize: 11,
                    }}
                  >
                    No coverage data
                  </div>
                )}
              </Panel>

              <Panel>
                <PanelHeader
                  title="Session Speech Summary"
                  sub="Aggregated audio signals"
                />
                {[
                  {
                    label: 'Filler Count',
                    score: Math.max(0, 100 - (filler.total_count ?? 0) * 8),
                    meta: `${filler.total_count ?? 0} used`,
                  },
                  {
                    label: 'Filler Density',
                    score: Math.max(0, 100 - (filler.average_density ?? 0) * 8),
                    meta: `${filler.average_density ?? 0}/100w`,
                  },
                  {
                    label: 'Flow Consistency',
                    score: flow.consistency ?? 0,
                    meta: `${flow.avg_wpm ?? 0} WPM`,
                  },
                  {
                    label: 'Confidence',
                    score: confSum.avg_score ?? 0,
                    meta: `${confSum.hedges ?? 0} hedges`,
                  },
                ].map((item, i) => (
                  <SkillRow
                    key={item.label}
                    label={item.label}
                    score={item.score}
                    note={item.meta}
                    delay={i * 0.06}
                  />
                ))}
              </Panel>
            </div>

            {data.gap_analysis &&
            (data.gap_analysis.repeated_gaps?.length ||
              data.gap_analysis.weak_dimensions?.length ||
              Object.keys(data.gap_analysis.dim_averages || {}).length) ? (
              <GapPanel gap={data.gap_analysis} />
            ) : null}
          </div>
        )}

        {/* SKILLS TAB */}
        {tab === 'skills' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              animation: 'fadeUp 0.4s ease both',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 16,
              }}
            >
              <Panel>
                <PanelHeader title="Skill Radar" />
                {radarData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <RadarChart
                      data={radarData}
                      margin={{
                        top: 10,
                        right: 20,
                        bottom: 10,
                        left: 20,
                      }}
                    >
                      <PolarGrid stroke="rgba(255,255,255,0.07)" />
                      <PolarAngleAxis
                        dataKey="subject"
                        tick={{ fontSize: 10, fill: C.muted }}
                      />
                      <Radar
                        name="Score"
                        dataKey="score"
                        stroke={C.accent}
                        fill={C.accent}
                        fillOpacity={0.12}
                        strokeWidth={2}
                      />
                      <Tooltip content={<ChartTip />} />
                    </RadarChart>
                  </ResponsiveContainer>
                ) : (
                  <div
                    style={{
                      textAlign: 'center',
                      color: C.muted,
                      padding: '3rem 0',
                      fontSize: 11,
                    }}
                  >
                    No skill data
                  </div>
                )}
              </Panel>
              <Panel>
                <PanelHeader
                  title="Score Breakdown"
                  sub="Per-skill performance"
                />
                {skillScores.map((s, i) => (
                  <SkillRow
                    key={s.skill}
                    label={s.skill}
                    score={s.score}
                    delay={i * 0.07}
                  />
                ))}
              </Panel>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 16,
              }}
            >
              <Panel accent>
                <PanelHeader title="Score Pillars" />
                {pillarScores.map((p, i) => (
                  <SkillRow
                    key={p.label}
                    label={p.label}
                    score={p.score}
                    color={p.color}
                    delay={i * 0.07}
                  />
                ))}
              </Panel>
              <Panel>
                <PanelHeader title="Performance Insights" />
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 10,
                  }}
                >
                  {[
                    {
                      label: 'Recovery',
                      value: data.recovery_score ?? 0,
                      color: C.accent2,
                    },
                    {
                      label: 'Pressure',
                      value: data.pressure_handling_score ?? 0,
                      color: C.rose,
                    },
                    {
                      label: 'Conciseness',
                      value: data.conciseness_score ?? 0,
                      color: C.sky,
                    },
                    {
                      label: 'Confidence',
                      value:
                        confSum.avg_score ??
                        data.score_pillars.confidence_score ??
                        0,
                      color: C.green,
                    },
                  ].map((card) => (
                    <div
                      key={card.label}
                      style={{
                        padding: '14px',
                        borderRadius: 12,
                        border: '1px solid rgba(255,255,255,0.07)',
                        background: 'rgba(255,255,255,0.02)',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          color: 'rgba(255,255,255,0.3)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.07em',
                          marginBottom: 8,
                        }}
                      >
                        {card.label}
                      </div>
                      <div
                        style={{
                          fontSize: 26,
                          fontWeight: 900,
                          color: card.color,
                          fontFamily: "'DM Mono', monospace",
                          lineHeight: 1,
                          marginBottom: 10,
                        }}
                      >
                        {card.value}
                      </div>
                      <AnimBar score={card.value} color={card.color} />
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            {data.gap_analysis &&
            Object.keys(data.gap_analysis.dim_averages || {}).length ? (
              <GapPanel gap={data.gap_analysis} />
            ) : null}
          </div>
        )}

        {/* QUESTIONS TAB */}
        {tab === 'questions' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              animation: 'fadeUp 0.4s ease both',
            }}
          >
            <Panel>
              <PanelHeader
                title="Score Per Question"
                sub="Performance timeline"
                right={
                  <span
                    style={{
                      fontSize: 11,
                      padding: '3px 10px',
                      borderRadius: 99,
                      background: 'rgba(34,211,238,0.1)',
                      border: '1px solid rgba(34,211,238,0.25)',
                      color: C.sky,
                      fontFamily: "'DM Mono', monospace",
                    }}
                  >
                    {qs.length} questions
                  </span>
                }
              />
              {timelineData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart
                    data={timelineData}
                    margin={{
                      top: 8,
                      right: 16,
                      bottom: 8,
                      left: -20,
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.04)"
                    />
                    <XAxis
                      dataKey="q"
                      tick={{ fontSize: 10, fill: C.muted }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 10, fill: C.muted }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<ChartTip />} />
                    <ReferenceLine
                      y={75}
                      stroke="rgba(245,158,11,0.2)"
                      strokeDasharray="4 4"
                    />
                    <Line
                      type="monotone"
                      dataKey="score"
                      name="Score"
                      stroke={C.accent}
                      strokeWidth={2.5}
                      dot={(props: any) => {
                        const { cx, cy, payload } = props;
                        const col = DIFF_COLOR[payload.diff] || C.accent2;
                        return (
                          <circle
                            key={`d-${payload.q}`}
                            cx={cx}
                            cy={cy}
                            r={5}
                            fill={col}
                            stroke={C.bg}
                            strokeWidth={2}
                          />
                        );
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div
                  style={{
                    textAlign: 'center',
                    color: C.muted,
                    padding: '2rem 0',
                    fontSize: 11,
                  }}
                >
                  No data
                </div>
              )}
              <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
                {Object.entries(DIFF_COLOR).map(([d, col]) => (
                  <div
                    key={d}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: col,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 10,
                        color: 'rgba(255,255,255,0.3)',
                        textTransform: 'capitalize',
                      }}
                    >
                      {d}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>

            {qs.map((q, i) => (
              <QuestionCard
                key={`q-${q.index}-${i}`}
                q={q}
                indexBase={indexBase}
                sessionAnalytics={data.analytics}
              />
            ))}
          </div>
        )}

        {/* FEEDBACK TAB */}
        {tab === 'feedback' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              animation: 'fadeUp 0.4s ease both',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 16,
              }}
            >
              <Panel>
                <PanelHeader
                  title="What went right"
                  sub={`${rightItems.length} identified`}
                  right={
                    <span
                      style={{
                        fontSize: 11,
                        padding: '3px 10px',
                        borderRadius: 99,
                        background: 'rgba(16,185,129,0.1)',
                        border: '1px solid rgba(16,185,129,0.2)',
                        color: C.green,
                        fontFamily: "'DM Mono', monospace",
                      }}
                    >
                      {rightItems.length} good
                    </span>
                  }
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {rightItems.length > 0 ? (
                    rightItems.map((item, i) => (
                      <FeedbackCard
                        key={i}
                        item={item}
                        variant="good"
                        index={i}
                      />
                    ))
                  ) : (
                    <div
                      style={{
                        textAlign: 'center',
                        color: C.muted,
                        padding: '1.5rem 0',
                        fontSize: 12,
                      }}
                    >
                      None identified
                    </div>
                  )}
                </div>
              </Panel>

              <Panel>
                <PanelHeader
                  title="What went wrong"
                  sub={`${wrongItems.length} gaps found`}
                  right={
                    <span
                      style={{
                        fontSize: 11,
                        padding: '3px 10px',
                        borderRadius: 99,
                        background: 'rgba(239,68,68,0.1)',
                        border: '1px solid rgba(239,68,68,0.2)',
                        color: C.rose,
                        fontFamily: "'DM Mono', monospace",
                      }}
                    >
                      {wrongItems.length} gaps
                    </span>
                  }
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {wrongItems.length > 0 ? (
                    wrongItems.map((item, i) => (
                      <FeedbackCard
                        key={i}
                        item={item}
                        variant="bad"
                        index={i}
                      />
                    ))
                  ) : (
                    <div
                      style={{
                        textAlign: 'center',
                        color: C.muted,
                        padding: '1.5rem 0',
                        fontSize: 12,
                      }}
                    >
                      None identified
                    </div>
                  )}
                </div>
              </Panel>
            </div>

            {data.tips?.length ? (
              <Panel>
                <PanelHeader
                  title={`${data.tips.length} things to fix before next interview`}
                  sub="Actionable improvements"
                  right={
                    <span
                      style={{
                        fontSize: 11,
                        padding: '3px 10px',
                        borderRadius: 99,
                        background: 'rgba(34,211,238,0.1)',
                        border: '1px solid rgba(34,211,238,0.2)',
                        color: C.sky,
                        fontFamily: "'DM Mono', monospace",
                      }}
                    >
                      {data.tips.length} tips
                    </span>
                  }
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.tips.map((tip, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        gap: 12,
                        padding: '12px 14px',
                        borderRadius: 10,
                        background: 'rgba(34,211,238,0.03)',
                        border: '1px solid rgba(34,211,238,0.12)',
                      }}
                    >
                      <span
                        style={{
                          color: C.sky,
                          fontFamily: "'DM Mono', monospace",
                          fontSize: 12,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {i + 1}.
                      </span>
                      <span
                        style={{
                          fontSize: 13,
                          color: 'rgba(255,255,255,0.7)',
                          lineHeight: 1.65,
                        }}
                      >
                        {tip}
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>
            ) : null}

            {data.coaching_priorities?.length ? (
              <Panel accent>
                <PanelHeader
                  title="Coaching Priorities"
                  sub="Critical issues hurting performance"
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.coaching_priorities.map((tip, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        gap: 12,
                        padding: '12px 14px',
                        borderRadius: 10,
                        background: 'rgba(255,92,53,0.04)',
                        border: '1px solid rgba(255,92,53,0.15)',
                      }}
                    >
                      <span
                        style={{
                          color: C.accent,
                          fontFamily: "'DM Mono', monospace",
                          fontSize: 12,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {i + 1}.
                      </span>
                      <span
                        style={{
                          fontSize: 13,
                          color: 'rgba(255,255,255,0.7)',
                          lineHeight: 1.65,
                        }}
                      >
                        {tip}
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>
            ) : null}

            {data.gap_analysis &&
            (data.gap_analysis.repeated_gaps?.length ||
              data.gap_analysis.weak_dimensions?.length) ? (
              <GapPanel gap={data.gap_analysis} />
            ) : null}

            <div
              style={{
                borderRadius: 18,
                padding: '32px 36px',
                textAlign: 'center',
                background:
                  'radial-gradient(ellipse at center, rgba(255,92,53,0.08), rgba(8,11,18,0))',
                border: '1px solid rgba(255,92,53,0.15)',
              }}
            >
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 900,
                  color: '#f0f0f0',
                  fontFamily: "'Syne', sans-serif",
                  marginBottom: 8,
                }}
              >
                Ready to <span style={{ color: C.accent }}>level up?</span>
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: 'rgba(255,255,255,0.4)',
                  marginBottom: 20,
                }}
              >
                Practice the gaps identified above in your next session.
              </p>
              <button
                onClick={() => router.push('/dashboard')}
                style={{
                  padding: '12px 28px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: C.accent,
                  border: 'none',
                  color: '#fff',
                  fontFamily: "'DM Mono', monospace",
                  letterSpacing: '0.05em',
                }}
              >
                Start Another Interview
              </button>
            </div>
          </div>
        )}

        {/* AUDIO TAB */}
        {tab === 'audio' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              animation: 'fadeUp 0.4s ease both',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 12,
              }}
            >
              {[
                {
                  label: 'Avg WPM',
                  value: avgWpm ?? '"',
                  sub: 'Target: 120"165 wpm',
                  color:
                    avgWpm && avgWpm >= 120 && avgWpm <= 165
                      ? C.green
                      : C.amber,
                },
                {
                  label: 'Total Fillers',
                  value: totalFillers,
                  sub: `Avg density: ${filler.average_density ?? 0}/100w`,
                  color: totalFillers < 10 ? C.green : C.rose,
                },
                {
                  label: 'Avg Confidence',
                  value: avgConf !== null ? `${avgConf}%` : '"',
                  sub: `${confSum.hedges ?? 0} total hedges`,
                  color: (avgConf ?? 0) >= 65 ? C.green : C.amber,
                },
                {
                  label: 'Total Long Pauses',
                  value: flow.long_pauses ?? 0,
                  sub: 'Across all answers',
                  color: (flow.long_pauses ?? 0) < 5 ? C.green : C.rose,
                },
                {
                  label: 'Avg Flow Consistency',
                  value: flow.consistency ? `${flow.consistency}%` : '"',
                  sub: 'Smoothness of delivery',
                  color: (flow.consistency ?? 0) >= 65 ? C.green : C.amber,
                },
                {
                  label: 'Self-Corrections',
                  value: confSum.self_corrections ?? 0,
                  sub: 'Indicators of uncertainty',
                  color:
                    (confSum.self_corrections ?? 0) < 5 ? C.green : C.amber,
                },
              ].map((m, i) => (
                <div
                  key={m.label}
                  style={{
                    padding: '18px 20px',
                    borderRadius: 14,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    animation: `fadeUp 0.4s ease ${i * 0.06}s both`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      color: 'rgba(255,255,255,0.3)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      marginBottom: 8,
                      fontFamily: "'DM Mono', monospace",
                    }}
                  >
                    {m.label}
                  </div>
                  <div
                    style={{
                      fontSize: 26,
                      fontWeight: 900,
                      color: m.color,
                      fontFamily: "'DM Mono', monospace",
                      lineHeight: 1,
                      marginBottom: 8,
                    }}
                  >
                    {m.value}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'rgba(255,255,255,0.25)',
                    }}
                  >
                    {m.sub}
                  </div>
                </div>
              ))}
            </div>

            <Panel>
              <PanelHeader
                title="Per-Question Audio Analytics"
                sub="Expand each question to see detailed signals"
              />
              {qsWithAudio.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    color: C.muted,
                    padding: '3rem 0',
                    fontSize: 12,
                  }}
                >
                  No audio analytics available for this session.
                </div>
              ) : null}
              {qs.map((q, i) => {
                const analytics = q.analytics || {};
                const hasAudio = Object.keys(analytics).length > 0;
                if (!hasAudio) return null;

                const col = DIFF_COLOR[q.difficulty] || C.muted;
                const conf = analytics.confidence_signals || {};
                const flow2 = analytics.flow || {};
                const filler2 = analytics.filler || {};
                const pillars = q.score_pillars || {};

                return (
                  <div
                    key={i}
                    style={{
                      marginBottom: 12,
                      borderRadius: 12,
                      border: '1px solid rgba(255,255,255,0.07)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 16px',
                        background: 'rgba(255,255,255,0.02)',
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          background: `${col}15`,
                          border: `1px solid ${col}30`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          fontWeight: 700,
                          color: col,
                          fontFamily: "'DM Mono', monospace",
                        }}
                      >
                        Q{q.index + indexBase}
                      </div>
                      <div
                        style={{
                          flex: 1,
                          fontSize: 12,
                          color: 'rgba(255,255,255,0.7)',
                          lineHeight: 1.4,
                        }}
                      >
                        {q.question}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          gap: 12,
                          flexShrink: 0,
                        }}
                      >
                        {[
                          { l: 'WPM', v: flow2.wpm ? Math.round(flow2.wpm) : '"' },
                          { l: 'Fillers', v: filler2.count ?? 0 },
                          {
                            l: 'Conf',
                            v:
                              conf.score !== undefined ? `${conf.score}%` : '"',
                          },
                        ].map(({ l, v }) => (
                          <div key={l} style={{ textAlign: 'center' }}>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 800,
                                color: '#22d3ee',
                                fontFamily: "'DM Mono', monospace",
                              }}
                            >
                              {v}
                            </div>
                            <div
                              style={{
                                fontSize: 9,
                                color: 'rgba(255,255,255,0.2)',
                              }}
                            >
                              {l}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <AudioAnalyticsPanel
                      analytics={analytics}
                      scorePillars={pillars}
                    />
                  </div>
                );
              })}
            </Panel>
          </div>
        )}

        {tab === 'recordings' && (
          <div className="fb-grid" style={{ animation: 'fadeUp 0.45s ease both' }}>
            <Panel>
              <PanelHeader
                title="Interview recordings"
                sub="Local session captures from your current setup"
              />
              <InterviewRecordingGallery
                recordings={recordings}
                emptyLabel="No local recordings found for this interview yet."
              />
            </Panel>
          </div>
        )}
      </main>
    </div>
  );
};



export default FeedbackPage;












