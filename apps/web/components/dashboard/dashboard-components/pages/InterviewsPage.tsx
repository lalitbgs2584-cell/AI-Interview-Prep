"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@repo/auth/client";
import CustomSessionModal from "./CustomSessionModal";

const interviewTypes = [
  {
    icon: "SD",
    name: "System Design",
    desc: "Scalable systems like URL shorteners, rate limiters, and chat apps.",
    tag: "Popular",
    tagClass: "tag-accent",
    count: "12 sessions done",
    types: ["Architecture", "Scalability", "Trade-offs", "HLD", "LLD"],
    interviewType: "SYSTEM_DESIGN",
  },
  {
    icon: "DS",
    name: "DSA / Coding",
    desc: "Arrays, trees, graphs, and dynamic programming with full algorithm practice.",
    tag: "Daily",
    tagClass: "tag-gold",
    count: "8 sessions done",
    types: ["Arrays", "Trees", "Graphs", "DP", "Sorting", "Recursion"],
    interviewType: "TECHNICAL",
  },
  {
    icon: "BH",
    name: "Behavioral",
    desc: "STAR-method practice for leadership, conflict, and culture-fit questions.",
    tag: "Suggested",
    tagClass: "tag-violet",
    count: "4 sessions done",
    types: ["STAR", "Leadership", "Conflict", "Culture-fit"],
    interviewType: "BEHAVIORAL",
  },
  {
    icon: "SQL",
    name: "SQL & Databases",
    desc: "Query writing, indexing, normalization, and schema design.",
    tag: "Weak area",
    tagClass: "tag-rose",
    count: "2 sessions done",
    types: ["Queries", "Indexing", "Schema", "Normalization", "Joins"],
    interviewType: "TECHNICAL",
  },
  {
    icon: "OS",
    name: "OS & Concurrency",
    desc: "Processes, threads, locks, scheduling, and memory management.",
    tag: "New",
    tagClass: "tag-sky",
    count: "0 sessions done",
    types: ["Processes", "Threads", "Mutexes", "Scheduling", "Memory"],
    interviewType: "TECHNICAL",
  },
  {
    icon: "NW",
    name: "Networking",
    desc: "HTTP, TCP/IP, DNS, and WebSockets with a practical internet-systems focus.",
    tag: "New",
    tagClass: "tag-sky",
    count: "1 session done",
    types: ["HTTP/HTTPS", "TCP/IP", "DNS", "WebSockets", "TLS"],
    interviewType: "TECHNICAL",
  },
  {
    icon: "FE",
    name: "Frontend",
    desc: "DOM, event loop, React internals, performance, and accessibility.",
    tag: "New",
    tagClass: "tag-sky",
    count: "0 sessions done",
    types: ["DOM", "React", "Event Loop", "Performance", "A11y"],
    interviewType: "TECHNICAL",
  },
  {
    icon: "BE",
    name: "Backend & APIs",
    desc: "REST, GraphQL, auth, rate limiting, and API design patterns.",
    tag: "New",
    tagClass: "tag-sky",
    count: "0 sessions done",
    types: ["REST", "GraphQL", "Auth", "Rate Limiting", "Design"],
    interviewType: "TECHNICAL",
  },
  {
    icon: "DO",
    name: "DevOps & Cloud",
    desc: "CI/CD, Docker, Kubernetes, AWS basics, and deployment pipelines.",
    tag: "New",
    tagClass: "tag-sky",
    count: "0 sessions done",
    types: ["CI/CD", "Docker", "Kubernetes", "AWS", "Pipelines"],
    interviewType: "TECHNICAL",
  },
  {
    icon: "MC",
    name: "Machine Coding",
    desc: "Build a working feature in 60-90 minutes with LLD and clean code focus.",
    tag: "Popular",
    tagClass: "tag-accent",
    count: "3 sessions done",
    types: ["LLD", "Clean Code", "OOP", "Design Patterns", "Live Build"],
    interviewType: "TECHNICAL",
  },
  {
    icon: "HR",
    name: "HR Round",
    desc: "Salary negotiation, career goals, strengths, and weaknesses.",
    tag: "Easy win",
    tagClass: "tag-gold",
    count: "1 session done",
    types: ["Negotiation", "Career Goals", "Strengths", "Weaknesses"],
    interviewType: "HR",
  },
  {
    icon: "PS",
    name: "Product Sense",
    desc: "Design a product, define metrics, and discuss trade-offs for PM-facing engineers.",
    tag: "Advanced",
    tagClass: "tag-violet",
    count: "0 sessions done",
    types: ["Metrics", "Product Design", "Trade-offs", "GTM"],
    interviewType: "BEHAVIORAL",
  },
  {
    icon: "SB",
    name: "Security Basics",
    desc: "XSS, CSRF, SQL injection, HTTPS, and OAuth with common security fundamentals.",
    tag: "New",
    tagClass: "tag-sky",
    count: "0 sessions done",
    types: ["XSS", "CSRF", "SQLi", "OAuth", "HTTPS"],
    interviewType: "TECHNICAL",
  },
  {
    icon: "DE",
    name: "Data Engineering",
    desc: "Pipelines, ETL, Spark, Kafka, and warehousing basics.",
    tag: "New",
    tagClass: "tag-sky",
    count: "0 sessions done",
    types: ["ETL", "Spark", "Kafka", "Pipelines", "Warehousing"],
    interviewType: "TECHNICAL",
  },
  {
    icon: "GA",
    name: "Generative AI",
    desc: "RAG, LLMs, embeddings, and vector databases.",
    tag: "New",
    tagClass: "tag-sky",
    count: "0 sessions done",
    types: ["RAG", "LLMs", "Embeddings", "Vector DB", "Prompting"],
    interviewType: "TECHNICAL",
  },
];

const upcomingSessions = [
  { id: 5, title: "System Design: Chat Application", type: "System Design", score: 0, date: "Scheduled - Tomorrow 10:00 AM", duration: "45 min", status: "medium" },
  { id: 6, title: "SQL: Window Functions Deep Dive", type: "Coding", score: 0, date: "Scheduled - Wed 3:00 PM", duration: "30 min", status: "low" },
];

export default function InterviewsPage() {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [hasResume, setHasResume] = useState(false);
  const [resumeLoading, setResumeLoading] = useState(true);

  const { data: session, isPending: authLoading } = authClient.useSession();

  useEffect(() => {
    if (authLoading || !session?.user?.id) return;

    const checkResumeUploaded = async () => {
      setResumeLoading(true);

      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/get-resume`, {
          credentials: "include",
        });

        if (!res.ok) {
          setHasResume(false);
          return;
        }

        const data = await res.json();
        setHasResume(data.resumeUploaded);
      } catch (error) {
        console.error(error);
        setHasResume(false);
      } finally {
        setResumeLoading(false);
      }
    };

    void checkResumeUploaded();
  }, [authLoading, session?.user?.id]);

  const handleStartInterview = async (
    event: React.MouseEvent<HTMLButtonElement>,
    interviewType: string,
    interviewTitle: string,
  ) => {
    event.preventDefault();
    if (!hasResume) return;

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/start-interview`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interviewType, interviewTitle }),
      });

      if (!response.ok) throw new Error("API failed");

      const result = await response.json();
      const interviewId = result.data.id;

      router.push(
        `/waiting-room?type=${encodeURIComponent(interviewType)}&title=${encodeURIComponent(interviewTitle)}&id=${encodeURIComponent(interviewId)}`,
      );
    } catch (error) {
      console.error("Start interview failed:", error);
    }
  };

  const handleCustomSession = () => {
    if (!hasResume) return;
    setModalOpen(true);
  };

  if (authLoading || resumeLoading) {
    return (
      <div className="dash-spinner-center">
        <div className="dash-spinner" />
      </div>
    );
  }

  return (
    <>
      {!hasResume && (
        <div className="resume-banner">
          <span className="resume-banner-icon">!</span>
          <span>Please upload your resume to unlock all interview sessions.</span>
        </div>
      )}

      <div className="dash-topbar">
        <div>
          <div className="dash-greeting">
            Start an <em>Interview</em>
          </div>
          <div className="dash-date">Choose a category and begin practicing</div>
        </div>
        <div className="topbar-actions">
          <div
            className={!hasResume ? "tooltip-wrapper" : undefined}
            data-tooltip={!hasResume ? "Please upload resume to get started" : undefined}
          >
            <button
              className="btn-new-session"
              onClick={handleCustomSession}
              disabled={!hasResume}
              style={!hasResume ? { opacity: 0.45, cursor: "not-allowed", pointerEvents: "none" } : undefined}
            >
              + Custom Session
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Interview Categories</div>
            <div className="panel-sub">Pick your focus area</div>
          </div>
        </div>
        <div className="interview-type-grid">
          {interviewTypes.map((item) => (
            <div
              key={item.name}
              className={!hasResume ? "tooltip-wrapper" : undefined}
              data-tooltip={!hasResume ? "Please upload resume to get started" : undefined}
            >
              <button
                className={`interview-type-card${!hasResume ? " interview-type-card--locked" : ""}`}
                disabled={!hasResume}
                onClick={(event) => void handleStartInterview(event, item.interviewType, item.name)}
                style={!hasResume ? { opacity: 0.45, cursor: "not-allowed", pointerEvents: "none" } : undefined}
              >
                <span className="interview-type-icon">{item.icon}</span>
                <div className="interview-type-meta">
                  <span className={`tag ${item.tagClass}`}>{item.tag}</span>
                  <span className="interview-type-count">{item.count}</span>
                </div>
                <div className="interview-type-name" style={{ marginTop: "0.75rem" }}>
                  {item.name}
                </div>
                <div className="interview-type-desc">{item.desc}</div>
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Upcoming Sessions</div>
            <div className="panel-sub">Scheduled practice</div>
          </div>
        </div>
        <div className="session-list">
          {upcomingSessions.map((sessionItem) => (
            <div key={sessionItem.id} className="session-row">
              <div className="session-row-left">
                <div className="session-score-badge score-medium" style={{ fontSize: "1rem" }} />
                <div>
                  <div className="session-title">{sessionItem.title}</div>
                  <div className="session-meta">
                    <span className={`tag ${sessionItem.type === "System Design" ? "tag-accent" : "tag-sky"}`}>
                      {sessionItem.type}
                    </span>
                    <span className="session-date">{sessionItem.date}</span>
                    <span className="session-duration">- {sessionItem.duration}</span>
                  </div>
                </div>
              </div>
              <div
                className={!hasResume ? "tooltip-wrapper" : undefined}
                data-tooltip={!hasResume ? "Please upload resume to get started" : undefined}
              >
                <button
                  className="btn-new-session"
                  disabled={!hasResume}
                  style={
                    !hasResume
                      ? { padding: "0.45rem 1rem", fontSize: "0.78rem", opacity: 0.45, cursor: "not-allowed", pointerEvents: "none" }
                      : { padding: "0.45rem 1rem", fontSize: "0.78rem" }
                  }
                >
                  Start
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <CustomSessionModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
