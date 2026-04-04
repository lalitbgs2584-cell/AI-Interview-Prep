"use client";

interface TopbarProps {
  title: string;
  sub?: string;
}

export default function Topbar({ title }: TopbarProps) {
  return (
    <header className="admin-topbar">
      {/* Page title */}
      <div>
        <h1 className="page-title">{title}</h1>
      </div>

      {/* Right actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        {/* Search */}
        <div className="topbar-search">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input placeholder="Search users, interviews" />
          <span style={{ fontFamily: "var(--ff-mono)", fontSize: "0.6rem", color: "var(--text-3)", marginLeft: "auto", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 5px" }}>K</span>
        </div>

        {/* Notification bell */}
        <button className="topbar-icon-btn" title="Notifications">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Live chip */}
        <div className="live-chip">
          <span className="dot-live" />
          Live
        </div>
      </div>
    </header>
  );
}