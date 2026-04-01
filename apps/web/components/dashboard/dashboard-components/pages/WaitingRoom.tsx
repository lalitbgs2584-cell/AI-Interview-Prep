"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSocket } from "@/ws-client-config/socket";
import { useInterviewStore } from "@/store/useInterviewStore";

const STEPS = [
  { id: 1, label: "Analyzing your resume",  duration: 2500 },
  { id: 2, label: "Selecting questions",     duration: 2000 },
  { id: 3, label: "Calibrating difficulty",  duration: 1800 },
  { id: 4, label: "Preparing your session",  duration: 1500 },
];

export default function WaitingRoom() {
  const searchParams   = useSearchParams();
  const interviewTitle = searchParams.get("title");
  const interviewId    = searchParams.get("id");
  const interviewType  = searchParams.get("type");
  const router         = useRouter();

  const [currentStep, setCurrentStep] = useState(0);
  const [ready, setReady]             = useState(false);
  const [exiting, setExiting]         = useState(false);
  const questionReceived              = useRef(false);
  console.log("Interview Id is : ",interviewId)
  // ── Auto-advance steps ──
  useEffect(() => {
    let stepIndex = 0;

    const runStep = () => {
      if (stepIndex >= STEPS.length) return;
      setCurrentStep(stepIndex + 1);
      const step = STEPS[stepIndex];
      if (!step) return;
      const currentDuration = step.duration;
      stepIndex++;
      if (stepIndex < STEPS.length) {
        setTimeout(runStep, currentDuration);
      }
    };

    const initial = setTimeout(runStep, 400);
    return () => clearTimeout(initial);
  }, []);

  // ── Socket ──
  useEffect(() => {
    const socket = getSocket();

    const handleQuestion = (data: any) => {
      if (questionReceived.current) return;
      questionReceived.current = true;

      useInterviewStore.getState().setCurrentQuestion(data);

      setCurrentStep(STEPS.length + 1);
      setReady(true);

      setTimeout(() => {
        setExiting(true);
        setTimeout(() => router.push(`/interview/${interviewId}`), 600);
      }, 1200);
    };

    const joinInterview = () => {
      console.log("✅ connected", socket.id);
      socket.emit("join_interview", { interviewId });
    };

    // If already connected (singleton socket reused from prev page), emit immediately
    if (socket.connected) {
      socket.emit("join_interview", { interviewId });
    }

    socket.on("connect", joinInterview);
    socket.on("connect_error", (err) => console.log("❌ connect error", err.message));
    socket.on("interview:question", handleQuestion);

    return () => {
      socket.off("connect", joinInterview);
      socket.off("connect_error");
      socket.off("interview:question", handleQuestion);
    };
  }, [interviewId, router]);

  const progress = Math.min(
    Math.round((currentStep / STEPS.length) * 100),
    100
  );

  return (
    <div className={`wr-root ${exiting ? "wr-exit" : ""}`}>
      {/* Ambient orbs */}
      <div className="wr-orb wr-orb-1" />
      <div className="wr-orb wr-orb-2" />
      <div className="wr-orb wr-orb-3" />

      <div className="wr-card">

        {/* Badge */}
        <div className="wr-badge">
          <span className={`wr-badge-dot ${ready ? "wr-badge-dot--ready" : ""}`} />
          {ready ? "Interview Ready" : "Preparing Interview"}
        </div>

        {/* Title */}
        <h1 className="wr-title">{interviewTitle}</h1>
        <p className="wr-type">{interviewType}</p>

        {/* Ring */}
        <div className={`wr-ring-wrap ${ready ? "wr-ring-done" : ""}`}>
          <svg className="wr-ring" viewBox="0 0 120 120">
            <circle className="wr-ring-track" cx="60" cy="60" r="50" />
            <circle
              className="wr-ring-fill"
              cx="60" cy="60" r="50"
              strokeDasharray="314"
              strokeDashoffset={
                ready ? 0 : 314 - (314 * currentStep) / STEPS.length
              }
              style={{
                transition: "stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)",
              }}
            />
          </svg>
          <div className="wr-ring-inner">
            {ready ? (
              <span className="wr-ring-check">✓</span>
            ) : (
              <span className="wr-ring-percent">{progress}%</span>
            )}
          </div>
        </div>

        {/* Steps */}
        <div className="wr-steps">
          {STEPS.map((step, i) => {
            const stepNum = i + 1;
            const done    = stepNum < currentStep;
            const active  = stepNum === currentStep;

            return (
              <div
                key={step.id}
                className={[
                  "wr-step",
                  done   ? "done"   : "",
                  active ? "active" : "",
                ].filter(Boolean).join(" ")}
              >
                <span className="wr-step-icon">
                  {done ? "✓" : active ? "◉" : "○"}
                </span>
                <span className="wr-step-label">{step.label}</span>

                {active && (
                  <>
                    <span className="wr-step-pulse" />
                    <span className="wr-dots">
                      <span /><span /><span />
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Status line */}
        <p className="wr-status-line">
          {ready
            ? "Your interview is ready. Good luck! 🎯"
            : currentStep > 0
            ? `${STEPS[currentStep - 1]?.label}...`
            : "Starting up..."}
        </p>

        {/* Progress bar */}
        <div className="wr-progress-bar">
          <div
            className="wr-progress-fill"
            style={{
              width: `${ready ? 100 : progress}%`,
              transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
            }}
          />
        </div>

      </div>
    </div>
  );
}