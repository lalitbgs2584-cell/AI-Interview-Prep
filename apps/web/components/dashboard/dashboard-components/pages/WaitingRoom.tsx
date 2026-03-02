"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";


interface WaitingRoomProps {
  interviewId: string;
  interviewTitle: string;
  interviewType: string;
}

const STEPS = [
  { id: 1, label: "Analyzing your resume",       duration: 2500 },
  { id: 2, label: "Selecting questions",          duration: 2000 },
  { id: 3, label: "Calibrating difficulty",       duration: 1800 },
  { id: 4, label: "Preparing your session",       duration: 1500 },
];

export default function WaitingRoom({ interviewId="lsjkdfsa", interviewTitle="lskdjf;", interviewType="lsdkjf" }: WaitingRoomProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);  // index of active step
  const [ready, setReady]             = useState(false);
  const [entered, setEntered]         = useState(false);

  useEffect(() => {
    let elapsed = 0;
    STEPS.forEach((step, i) => {
      setTimeout(() => setCurrentStep(i + 1), elapsed);
      elapsed += step.duration;
    });
    setTimeout(() => setReady(true), elapsed);
  }, []);

  const handleEnter = () => {
    if (!ready) return;
    setEntered(true);
    setTimeout(() => router.push(`/interview/${interviewId}`), 600);
  };

  return (
    <div className={`wr-root ${entered ? "wr-exit" : ""}`}>
      {/* Ambient orbs */}
      <div className="wr-orb wr-orb-1" />
      <div className="wr-orb wr-orb-2" />
      <div className="wr-orb wr-orb-3" />

      <div className="wr-card">
        {/* Top label */}
        <div className="wr-badge">
          <span className="wr-badge-dot" />
          Preparing Interview
        </div>

        {/* Title */}
        <h1 className="wr-title">{interviewTitle}</h1>
        <p className="wr-type">{interviewType}</p>

        {/* Animated loader ring */}
        <div className={`wr-ring-wrap ${ready ? "wr-ring-done" : ""}`}>
          <svg className="wr-ring" viewBox="0 0 120 120">
            <circle className="wr-ring-track" cx="60" cy="60" r="50" />
            <circle
              className="wr-ring-fill"
              cx="60" cy="60" r="50"
              strokeDasharray="314"
              strokeDashoffset={ready ? 0 : 314 - (314 * currentStep) / STEPS.length}
            />
          </svg>
          <div className="wr-ring-inner">
            {ready ? (
              <span className="wr-ring-check">✓</span>
            ) : (
              <span className="wr-ring-percent">
                {Math.round((currentStep / STEPS.length) * 100)}%
              </span>
            )}
          </div>
        </div>

        {/* Steps */}
        <div className="wr-steps">
          {STEPS.map((step, i) => {
            const done    = i + 1 < currentStep;
            const active  = i + 1 === currentStep;
            return (
              <div key={step.id} className={`wr-step ${done ? "done" : ""} ${active ? "active" : ""}`}>
                <span className="wr-step-icon">
                  {done ? "✓" : active ? "◉" : "○"}
                </span>
                <span className="wr-step-label">{step.label}</span>
                {active && <span className="wr-step-pulse" />}
              </div>
            );
          })}
        </div>

        {/* CTA Button */}
        <button
          className={`wr-enter-btn ${ready ? "ready" : "waiting"}`}
          onClick={handleEnter}
          disabled={!ready}
        >
          {ready ? (
            <>
              <span className="wr-btn-dot" />
              Enter Interview →
            </>
          ) : (
            <>
              <span className="wr-btn-spinner" />
              Setting up your session...
            </>
          )}
        </button>

        {ready && (
          <p className="wr-ready-hint">Your interview is ready. Good luck! 🎯</p>
        )}
      </div>
    </div>
  );
}