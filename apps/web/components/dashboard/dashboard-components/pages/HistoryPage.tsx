'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import InterviewRecordingGallery from '@/components/recordings/InterviewRecordingGallery';
import { fetchInterviewRecordings, type RecordingItem } from '@/lib/interview-recordings';

//  Config 

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const TYPE_FILTERS = ['All', 'System Design', 'Coding', 'Behavioral'] as const;

type FilterType = (typeof TYPE_FILTERS)[number];
type SessionStatus = 'completed' | 'terminated' | 'in_progress';

//  Types 

interface Session {
  id: string;
  title: string;
  type: 'System Design' | 'Coding' | 'Behavioral' | string;
  date: string;
  duration: number | null;
  score: number | null;
  status: SessionStatus;
}

interface UnifiedResult {
  role: string;
  interview_type: string;
  date_iso: string;
  duration_seconds: number;
  recommendation: string;
  summary: string;
  overall_score: number;
  strengths?: string[];
  weaknesses?: string[];
  coaching_priorities?: string[];
  question_scores?: Array<{
    index: number;
    score: number;
    difficulty: string;
    question: string;
    user_answer?: string;
    feedback: string;
    dimensions?: Record<string, number>;
  }>;
  analytics?: {
    filler_summary?: Record<string, any>;
    flow_summary?: Record<string, any>;
    confidence_summary?: Record<string, any>;
  };
}

//  Helpers 

const TYPE_COLOR: Record<string, string> = {
  'System Design': '#8b5cf6',
  Coding: '#06b6d4',
  Behavioral: '#f59e0b',
};
const TYPE_BG: Record<string, string> = {
  'System Design': 'rgba(139,92,246,0.12)',
  Coding: 'rgba(6,182,212,0.12)',
  Behavioral: 'rgba(245,158,11,0.12)',
};
const DIFF_COLOR: Record<string, string> = {
  EASY: '#34d399',
  MEDIUM: '#f59e0b',
  HARD: '#ef4444',
};

const scoreColor = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return '#6b7280';
  if (n >= 75) return '#34d399';
  if (n >= 55) return '#f59e0b';
  return '#ef4444';
};
const scoreBg = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return 'rgba(107,114,128,0.10)';
  if (n >= 75) return 'rgba(52,211,153,0.10)';
  if (n >= 55) return 'rgba(245,158,11,0.10)';
  return 'rgba(239,68,68,0.10)';
};
const fmtDuration = (secs: number | null | undefined): string => {
  if (!secs && secs !== 0) return '';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
};
const fmtDate = (iso: string): string => {
  try {
    const d = new Date(iso);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400)
      return `Today, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    if (diff < 172800) return 'Yesterday';
    if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
};

const typeTagClass = (type: string): string => {
  if (type === 'System Design') return 'tag tag-violet';
  if (type === 'Coding') return 'tag tag-sky';
  if (type === 'Behavioral') return 'tag tag-amber';
  return 'tag tag-accent';
};

//  Score Ring 

function ScoreRing({ score, size = 76 }: { score: number; size?: number }) {
  const r = size / 2 - 6;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        style={{ width: size, height: size, transform: 'rotate(-90deg)' }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="6"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={scoreColor(score)}
          strokeWidth="6"
          strokeDasharray={`${(score / 100) * circ} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.24,
          fontWeight: 800,
          color: scoreColor(score),
        }}
      >
        {score}
      </div>
    </div>
  );
}

//  Metric Bar 

function MetricBar({ label, value }: { label: string; value: number | undefined | null }) {
  const v = value ?? 0;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: scoreColor(v) }}>{v}</span>
      </div>
      <div
        style={{
          height: 5,
          borderRadius: 99,
          background: 'rgba(255,255,255,0.06)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${v}%`,
            background: scoreColor(v),
            borderRadius: 99,
            transition: 'width 0.7s ease',
          }}
        />
      </div>
    </div>
  );
}

//  Question Card 

function QuestionCard({
  q,
  index,
}: {
  q: NonNullable<UnifiedResult['question_scores']>[number];
  index: number;
}) {
  const [open, setOpen] = useState(false);
  const diff = q.difficulty?.toUpperCase();

  return (
    <div
      style={{
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(255,255,255,0.02)',
        overflow: 'hidden',
        marginBottom: 8,
      }}
    >
      <div
        onClick={() => setOpen((p) => !p)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            background: 'rgba(139,92,246,0.12)',
            border: '1px solid rgba(139,92,246,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            color: '#8b5cf6',
            flexShrink: 0,
          }}
        >
          {index + 1}
        </div>
        <div style={{ flex: 1, fontSize: 13, color: '#d1d5db', lineHeight: 1.5 }}>
          {q.question}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {diff && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: DIFF_COLOR[diff] ?? '#6b7280',
                background: `${DIFF_COLOR[diff] ?? '#6b7280'}18`,
                padding: '2px 7px',
                borderRadius: 99,
              }}
            >
              {diff}
            </span>
          )}
          {q.score !== null && (
            <span style={{ fontSize: 12, fontWeight: 700, color: scoreColor(q.score) }}>
              {q.score}
            </span>
          )}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            style={{
              color: '#4b5563',
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s',
            }}
          >
            <path
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {open && (
        <div
          style={{ padding: '0 16px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}
        >
          {/* Dimension scores */}
          {q.dimensions && Object.keys(q.dimensions).length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${Math.min(Object.keys(q.dimensions).length, 3)}, 1fr)`,
                gap: 8,
                margin: '14px 0',
              }}
            >
              {Object.entries(q.dimensions).map(([key, val]) => (
                <div
                  key={key}
                  style={{
                    textAlign: 'center',
                    padding: '10px 8px',
                    borderRadius: 8,
                    background: scoreBg(val),
                    border: `1px solid ${scoreColor(val)}20`,
                  }}
                >
                  <div style={{ fontSize: 16, fontWeight: 800, color: scoreColor(val) }}>
                    {val}
                  </div>
                  <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2, textTransform: 'capitalize' }}>
                    {key}
                  </div>
                </div>
              ))}
              {/* Overall score card */}
              <div
                style={{
                  textAlign: 'center',
                  padding: '10px 8px',
                  borderRadius: 8,
                  background: scoreBg(q.score),
                  border: `1px solid ${scoreColor(q.score)}20`,
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 800, color: scoreColor(q.score) }}>
                  {q.score}
                </div>
                <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>Overall</div>
              </div>
            </div>
          )}

          {/* User answer */}
          {q.user_answer && (
            <div
              style={{
                fontSize: 12,
                color: '#9ca3af',
                lineHeight: 1.65,
                padding: '10px 14px',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.05)',
                marginBottom: 8,
              }}
            >
              <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
                Your answer
              </div>
              {q.user_answer}
            </div>
          )}

          {/* Feedback */}
          {q.feedback && (
            <div
              style={{
                fontSize: 12,
                color: '#9ca3af',
                lineHeight: 1.65,
                padding: '10px 14px',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
                Feedback
              </div>
              {q.feedback}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

//  Skeleton Row 

function SkeletonRow() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '16px 0',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: 'rgba(255,255,255,0.05)',
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          style={{
            height: 13,
            borderRadius: 6,
            background: 'rgba(255,255,255,0.06)',
            width: '52%',
          }}
        />
        <div
          style={{
            height: 10,
            borderRadius: 6,
            background: 'rgba(255,255,255,0.04)',
            width: '28%',
          }}
        />
      </div>
      <div
        style={{ width: 52, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.05)' }}
      />
    </div>
  );
}

//  Session Row 

function SessionRow({ s, onClick }: { s: Session; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="session-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '14px 18px',
        borderRadius: 12,
        cursor: 'pointer',
        border: '1px solid rgba(255,255,255,0.05)',
        background: 'rgba(255,255,255,0.02)',
        transition: 'background 0.15s, border-color 0.15s',
        marginBottom: 8,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)';
        (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.09)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.02)';
        (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.05)';
      }}
    >
      {/* Type icon */}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: TYPE_BG[s.type] ?? 'rgba(139,92,246,0.12)',
          border: `1px solid ${(TYPE_COLOR[s.type] ?? '#8b5cf6')}30`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {s.type === 'System Design' && (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
              stroke={TYPE_COLOR[s.type]}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {s.type === 'Coding' && (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M16 18l6-6-6-6M8 6l-6 6 6 6"
              stroke={TYPE_COLOR[s.type]}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {s.type === 'Behavioral' && (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
              stroke={TYPE_COLOR[s.type]}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>

      {/* Title + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: '#f3f4f6',
            marginBottom: 4,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {s.title || `${s.type} interview`}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className={typeTagClass(s.type)}>{s.type}</span>
          <span style={{ fontSize: 11, color: '#6b7280' }}>{fmtDate(s.date)}</span>
          <span style={{ fontSize: 11, color: '#374151' }}>-</span>
          <span style={{ fontSize: 11, color: '#6b7280' }}>{fmtDuration(s.duration)}</span>
          {s.status === 'terminated' && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#ef4444',
                background: 'rgba(239,68,68,0.1)',
                padding: '2px 8px',
                borderRadius: 99,
              }}
            >
              Terminated
            </span>
          )}
          {s.status === 'in_progress' && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#f59e0b',
                background: 'rgba(245,158,11,0.1)',
                padding: '2px 8px',
                borderRadius: 99,
              }}
            >
              In Progress
            </span>
          )}
        </div>
      </div>

      {/* Score + chevron */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {s.score !== null ? (
          <div
            style={{
              minWidth: 52,
              textAlign: 'center',
              padding: '6px 12px',
              borderRadius: 8,
              background: scoreBg(s.score),
              border: `1px solid ${scoreColor(s.score)}22`,
            }}
          >
            <div
              style={{ fontSize: 16, fontWeight: 800, color: scoreColor(s.score), lineHeight: 1 }}
            >
              {s.score}
            </div>
            <div style={{ fontSize: 9, color: scoreColor(s.score), opacity: 0.65, marginTop: 2 }}>
              / 100
            </div>
          </div>
        ) : (
          <div
            style={{
              minWidth: 52,
              textAlign: 'center',
              padding: '6px 12px',
              borderRadius: 8,
              background: 'rgba(107,114,128,0.08)',
              border: '1px solid rgba(107,114,128,0.15)',
            }}
          >
            <div style={{ fontSize: 12, color: '#4b5563' }}></div>
          </div>
        )}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          style={{ color: '#374151' }}
        >
          <path
            d="M9 18l6-6-6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}

//  Result Drawer 

function ResultDrawer({
  session,
  result,
  recordings,
  loading,
  error,
  onClose,
}: {
  session: Session;
  result: UnifiedResult | null;
  recordings: RecordingItem[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'overview' | 'questions' | 'analytics' | 'recordings'>(
    'overview'
  );

  const questions = result?.question_scores ?? [];

  // Reset tab when session changes
  useEffect(() => {
    setTab('overview');
  }, [session.id]);

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'questions', label: `Questions (${questions.length})` },
    ...(result?.analytics ? [{ key: 'analytics', label: 'Analytics' }] : []),
    ...(recordings.length > 0 ? [{ key: 'recordings', label: `Recordings (${recordings.length})` }] : []),
  ] as const;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px,100vw)',
          height: '100%',
          background: '#0f0f13',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '24px 28px 0',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: TYPE_COLOR[session.type] ?? '#8b5cf6',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 6,
              }}
            >
              {session.type}
            </div>
            <div
              style={{
                fontSize: 17,
                fontWeight: 700,
                color: '#f3f4f6',
                lineHeight: 1.35,
                marginBottom: 6,
              }}
            >
              {session.title || `${session.type} interview`}
            </div>
            <div
              style={{
                fontSize: 12,
                color: '#6b7280',
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <span>{fmtDate(session.date)}</span>
              <span>-</span>
              <span>{fmtDuration(session.duration)}</span>
              {session.status === 'terminated' && (
                <span style={{ color: '#ef4444', fontWeight: 600 }}>- Terminated</span>
              )}
              {session.status === 'in_progress' && (
                <span style={{ color: '#f59e0b', fontWeight: 600 }}>- In Progress</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              flexShrink: 0,
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#9ca3af',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        {!loading && result && (
          <div style={{ display: 'flex', gap: 4, padding: '16px 28px 0', flexWrap: 'wrap' }}>
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key as typeof tab)}
                style={{
                  padding: '7px 16px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  background:
                    tab === t.key ? 'rgba(139,92,246,0.15)' : 'transparent',
                  color: tab === t.key ? '#a78bfa' : '#6b7280',
                  transition: 'all 0.15s',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        <div
          style={{
            width: '100%',
            height: 1,
            background: 'rgba(255,255,255,0.06)',
            margin: '16px 0 0',
          }}
        />

        {/* Loading */}
        {loading && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              color: '#6b7280',
              fontSize: 13,
            }}
          >
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              style={{ animation: 'spin 1s linear infinite' }}
            >
              <path
                d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            Fetching results
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: 40,
              color: '#ef4444',
              fontSize: 13,
              textAlign: 'center',
            }}
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
              <path
                d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {error}
          </div>
        )}

        {/* No result */}
        {!loading && !error && !result && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: 40,
            }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 12h6M9 16h6M7 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2h-2M9 4a2 2 0 012-2h2a2 2 0 012 2v0a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                stroke="#374151"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div style={{ fontSize: 14, color: '#4b5563', textAlign: 'center' }}>
              No results available for this session.
            </div>
          </div>
        )}

        {/*  Overview Tab  */}
        {!loading && result && tab === 'overview' && (
          <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Score + summary */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                padding: '20px 22px',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <ScoreRing score={result.overall_score} size={80} />
              <div>
                <div
                  style={{ fontSize: 13, fontWeight: 600, color: '#f3f4f6', marginBottom: 4 }}
                >
                  Overall Score
                  {result.recommendation && (
                    <span
                      style={{
                        marginLeft: 10,
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '2px 9px',
                        borderRadius: 99,
                        background: scoreBg(result.overall_score),
                        color: scoreColor(result.overall_score),
                      }}
                    >
                      {result.recommendation}
                    </span>
                  )}
                </div>
                {result.summary && (
                  <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.65 }}>
                    {result.summary}
                  </div>
                )}
              </div>
            </div>

            {/* Quick stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {[
                { label: 'Questions', value: questions.length },
                { label: 'Duration', value: fmtDuration(result.duration_seconds) },
                { label: 'Role', value: result.role || '' },
                { label: 'Type', value: result.interview_type || session.type },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#d1d5db' }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Score breakdown from dimensions if available, else question avg */}
            {questions.length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#4b5563',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: 14,
                  }}
                >
                  Score Breakdown
                </div>
                {(() => {
                  // Aggregate dimension scores across questions
                  const dimTotals: Record<string, number[]> = {};
                  questions.forEach((q) => {
                    if (q.dimensions) {
                      Object.entries(q.dimensions).forEach(([k, v]) => {
                        if (!dimTotals[k]) dimTotals[k] = [];
                        dimTotals[k].push(v);
                      });
                    }
                  });
                  const dimAvgs = Object.entries(dimTotals).map(([k, vs]) => ({
                    label: k.charAt(0).toUpperCase() + k.slice(1),
                    value: Math.round(vs.reduce((a, b) => a + b, 0) / vs.length),
                  }));
                  return dimAvgs.length > 0
                    ? dimAvgs.map((d) => (
                        <MetricBar key={d.label} label={d.label} value={d.value} />
                      ))
                    : (
                        <>
                          <MetricBar
                            label="Avg Question Score"
                            value={Math.round(
                              questions.reduce((a, q) => a + q.score, 0) / questions.length
                            )}
                          />
                        </>
                      );
                })()}
              </div>
            )}

            {/* Strengths */}
            {(result.strengths ?? []).length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#4b5563',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: 12,
                  }}
                >
                  Strengths
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(result.strengths ?? []).map((s, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        padding: '10px 14px',
                        background: 'rgba(52,211,153,0.06)',
                        border: '1px solid rgba(52,211,153,0.14)',
                        borderRadius: 10,
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        style={{ flexShrink: 0, marginTop: 1 }}
                      >
                        <path
                          d="M20 6L9 17l-5-5"
                          stroke="#34d399"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span style={{ fontSize: 13, color: '#d1fae5', lineHeight: 1.5 }}>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Weaknesses */}
            {(result.weaknesses ?? []).length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#4b5563',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: 12,
                  }}
                >
                  Areas to Improve
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(result.weaknesses ?? []).map((s, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        padding: '10px 14px',
                        background: 'rgba(245,158,11,0.06)',
                        border: '1px solid rgba(245,158,11,0.14)',
                        borderRadius: 10,
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        style={{ flexShrink: 0, marginTop: 1 }}
                      >
                        <path
                          d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                          stroke="#f59e0b"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span style={{ fontSize: 13, color: '#fef3c7', lineHeight: 1.5 }}>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Coaching priorities */}
            {(result.coaching_priorities ?? []).length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#4b5563',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: 12,
                  }}
                >
                  Coaching Priorities
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(result.coaching_priorities ?? []).map((s, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        padding: '10px 14px',
                        background: 'rgba(139,92,246,0.06)',
                        border: '1px solid rgba(139,92,246,0.14)',
                        borderRadius: 10,
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        style={{ flexShrink: 0, marginTop: 1 }}
                      >
                        <path
                          d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"
                          stroke="#8b5cf6"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span style={{ fontSize: 13, color: '#ede9fe', lineHeight: 1.5 }}>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/*  Questions Tab  */}
        {!loading && result && tab === 'questions' && (
          <div style={{ padding: '20px 28px' }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#4b5563',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 14,
              }}
            >
              Per-question breakdown
            </div>
            {questions.length === 0 && (
              <div
                style={{
                  fontSize: 13,
                  color: '#4b5563',
                  textAlign: 'center',
                  padding: '32px 0',
                }}
              >
                No question data available.
              </div>
            )}
            {questions.map((q, i) => (
              <QuestionCard key={q.index ?? i} q={q} index={i} />
            ))}
          </div>
        )}

        {/*  Analytics Tab  */}
        {!loading && result && tab === 'analytics' && result.analytics && (
          <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#4b5563',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 4,
              }}
            >
              Audio & Speech Analytics
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {[
                { label: 'Avg WPM', value: result.analytics.flow_summary?.avg_wpm },
                { label: 'Filler count', value: result.analytics.filler_summary?.total_count },
                { label: 'Confidence', value: result.analytics.confidence_summary?.avg_score },
                { label: 'Avg Latency', value: result.analytics.flow_summary?.avg_latency_ms ? `${result.analytics.flow_summary.avg_latency_ms}ms` : undefined },
                { label: 'Hedges', value: result.analytics.confidence_summary?.hedges },
                { label: 'Consistency', value: result.analytics.flow_summary?.consistency },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    padding: '14px 16px',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    {item.label}
                  </div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 800,
                      color: typeof item.value === 'number' ? scoreColor(item.value) : '#d1d5db',
                    }}
                  >
                    {item.value ?? ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/*  Recordings Tab  */}
        {!loading && result && tab === 'recordings' && (
          <div style={{ padding: '20px 28px' }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#4b5563',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 14,
              }}
            >
              Session Recordings
            </div>
            <InterviewRecordingGallery
              recordings={recordings}
              emptyLabel="No recordings found for this session yet."
            />
          </div>
        )}
      </div>
    </div>
  );
}

//  Main Page 

export default function HistoryPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('All');
  const [search, setSearch] = useState('');

  const [drawerSession, setDrawerSession] = useState<Session | null>(null);
  const [drawerResult, setDrawerResult] = useState<UnifiedResult | null>(null);
  const [drawerRecordings, setDrawerRecordings] = useState<RecordingItem[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/api/interview/history`, { credentials: 'include' });
      if (res.status === 404) { setSessions([]); return; }
      if (!res.ok) throw new Error(`History fetch failed: ${res.status}`);
      const data = (await res.json()) as Session[];
      setSessions(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // Fetch drawer data when a session is selected
  useEffect(() => {
    if (!drawerSession) return;
    let cancelled = false;

    const load = async () => {
      setDrawerLoading(true);
      setDrawerError(null);
      setDrawerResult(null);
      setDrawerRecordings([]);

      try {
        const [resResult, recJson] = await Promise.all([
          fetch(`${API_BASE}/api/interview/${drawerSession.id}/results`, { credentials: 'include' }),
          fetchInterviewRecordings(drawerSession.id),
        ]);

        if (!resResult.ok) throw new Error(`Result fetch failed: ${resResult.status}`);
        const resultJson = (await resResult.json()) as UnifiedResult;

        if (!cancelled) {
          setDrawerResult({
            ...resultJson,
            strengths: Array.isArray(resultJson.strengths) ? resultJson.strengths : [],
            weaknesses: Array.isArray(resultJson.weaknesses) ? resultJson.weaknesses : [],
            question_scores: Array.isArray(resultJson.question_scores) ? resultJson.question_scores : [],
            coaching_priorities: Array.isArray(resultJson.coaching_priorities) ? resultJson.coaching_priorities : [],
          });
          setDrawerRecordings(recJson);
        }
      } catch (e) {
        if (!cancelled) {
          setDrawerError(e instanceof Error ? e.message : 'Failed to load session');
        }
      } finally {
        if (!cancelled) setDrawerLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [drawerSession]);

  const filtered = useMemo(
    () =>
      sessions.filter((s) => {
        if (activeFilter !== 'All' && s.type !== activeFilter) return false;
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          return s.title?.toLowerCase().includes(q) || s.type.toLowerCase().includes(q);
        }
        return true;
      }),
    [sessions, activeFilter, search]
  );

  const scores = sessions.map((s) => s.score).filter((s): s is number => s !== null);
  const avgScore = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;
  const bestScore = scores.length ? Math.max(...scores) : null;
  const completedCount = sessions.filter((s) => s.status === 'completed').length;
  const completionRate = sessions.length
    ? Math.round((completedCount / sessions.length) * 100)
    : 0;

  const handleExport = () => {
    if (!sessions.length) return;
    const esc = (v: string | number | null | undefined) =>
      `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['title', 'type', 'status', 'score', 'date', 'duration'].join(',');
    const rows = sessions.map((s) =>
      [esc(s.title), esc(s.type), esc(s.status), esc(s.score), esc(s.date), esc(s.duration)].join(',')
    );
    const blob = new Blob([`${header}\n${rows.join('\n')}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {/* Drawer */}
      {drawerSession && (
        <ResultDrawer
          session={drawerSession}
          result={drawerResult}
          recordings={drawerRecordings}
          loading={drawerLoading}
          error={drawerError}
          onClose={() => {
            setDrawerSession(null);
            setDrawerResult(null);
            setDrawerRecordings([]);
            setDrawerError(null);
          }}
        />
      )}

      {/* Top bar */}
      <div className="dash-topbar">
        <div>
          <div className="dash-greeting">
            Interview <em>History</em>
          </div>
          <div className="dash-date">
            {loading
              ? 'Loading sessions'
              : `${sessions.length} total - Avg score ${avgScore ?? ''}`}
          </div>
        </div>
        <div className="topbar-actions">
          <button
            className="resume-action-btn"
            onClick={handleExport}
            disabled={loading || !sessions.length}
            style={{ opacity: loading || !sessions.length ? 0.5 : 1 }}
          >
             Export CSV
          </button>
          <button
            className="resume-action-btn"
            onClick={fetchHistory}
            disabled={loading}
            style={{ opacity: loading ? 0.5 : 1 }}
          >
            {loading ? '' : '  Refresh'}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div
          style={{
            marginBottom: 20,
            padding: '14px 20px',
            borderRadius: 12,
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            color: '#fca5a5',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>  {error}</span>
          <button
            onClick={fetchHistory}
            style={{
              background: 'none',
              border: 'none',
              color: '#f87171',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid">
        <div className="dash-stat-card anim-0">
          <div className="dash-stat-top">
            <span className="stat-card-dot dot-accent" />
            <span className="dash-stat-label">Total Sessions</span>
          </div>
          <div className="dash-stat-value">
            {loading ? (
              <span style={{ color: '#374151' }}></span>
            ) : (
              <>
                {sessions.length}
                <span className="dash-stat-unit">done</span>
              </>
            )}
          </div>
          <div className="dash-stat-delta">{completedCount} completed</div>
        </div>
        <div className="dash-stat-card anim-1">
          <div className="dash-stat-top">
            <span className="stat-card-dot dot-gold" />
            <span className="dash-stat-label">Avg Score</span>
          </div>
          <div className="dash-stat-value">
            {loading ? (
              <span style={{ color: '#374151' }}></span>
            ) : (
              <>
                {avgScore ?? ''}
                <span className="dash-stat-unit">/ 100</span>
              </>
            )}
          </div>
          <div className="dash-stat-delta">{scores.length} scored sessions</div>
        </div>
        <div className="dash-stat-card anim-2">
          <div className="dash-stat-top">
            <span className="stat-card-dot dot-violet" />
            <span className="dash-stat-label">Best Score</span>
          </div>
          <div className="dash-stat-value">
            {loading ? (
              <span style={{ color: '#374151' }}></span>
            ) : (
              <>
                {bestScore ?? ''}
                <span className="dash-stat-unit">/ 100</span>
              </>
            )}
          </div>
          <div className="dash-stat-delta">Highest session result</div>
        </div>
        <div className="dash-stat-card anim-3">
          <div className="dash-stat-top">
            <span className="stat-card-dot dot-accent" />
            <span className="dash-stat-label">Completion Rate</span>
          </div>
          <div className="dash-stat-value">
            {loading ? (
              <span style={{ color: '#374151' }}></span>
            ) : (
              <>
                {completionRate}
                <span className="dash-stat-unit">%</span>
              </>
            )}
          </div>
          <div className="dash-stat-delta">Completed sessions</div>
        </div>
      </div>

      {/* Session list panel */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">All Sessions</div>
            <div className="panel-sub">
              {loading ? 'Loading' : `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`}
            </div>
          </div>
        </div>

        {/* Filter row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: '1.25rem',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
          }}
        >
          <div className="history-filter-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {TYPE_FILTERS.map((f) => (
              <button
                key={f}
                className={`history-filter-btn${activeFilter === f ? ' active' : ''}`}
                onClick={() => setActiveFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
          <div style={{ position: 'relative' }}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              style={{
                position: 'absolute',
                left: 11,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#4b5563',
                pointerEvents: 'none',
              }}
            >
              <path
                d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="text"
              placeholder="Search sessions"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                paddingLeft: 32,
                paddingRight: 14,
                paddingTop: 8,
                paddingBottom: 8,
                fontSize: 13,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                color: '#f3f4f6',
                outline: 'none',
                width: 200,
              }}
            />
          </div>
        </div>

        {/* List */}
        <div className="session-list">
          {loading && [...Array(5)].map((_, i) => <SkeletonRow key={i} />)}

          {!loading && !error && filtered.length === 0 && (
            <div style={{ padding: '48px 0', textAlign: 'center' }}>
              <svg
                width="44"
                height="44"
                viewBox="0 0 24 24"
                fill="none"
                style={{ margin: '0 auto 14px', display: 'block' }}
              >
                <path
                  d="M9 12h6M9 16h6M7 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2h-2M9 4a2 2 0 012-2h2a2 2 0 012 2v0a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  stroke="#374151"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <div style={{ fontSize: 14, color: '#4b5563' }}>
                {search
                  ? `No sessions matching "${search}"`
                  : 'No interviews yet. Start your first session!'}
              </div>
            </div>
          )}

          {!loading && !error && filtered.map((s) => (
            <SessionRow key={s.id} s={s} onClick={() => setDrawerSession(s)} />
          ))}
        </div>
      </div>
    </>
  );
}

