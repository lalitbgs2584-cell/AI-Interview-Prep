"use client";

import Topbar from "@/components/layouts/Topbar";
import DocsAssistant from "@/components/admin/DocsAssistant";
import { adminDocFiles, adminDocSections } from "@/lib/admin-docs";

export default function DocsPage() {
  return (
    <>
      <Topbar title="Documentation" />
      <main className="admin-main">
        <div className="panel anim-0 docs-hero">
          <div>
            <div className="page-title">Admin Documentation Hub</div>
            <div className="page-sub" style={{ marginTop: '0.55rem' }}>
              Internal docs for your admin app, backend routes, recording flow, and the most important file locations.
            </div>
          </div>
          <div className="docs-hero-stats">
            <div className="stat-card">
              <div className="stat-label">Doc Sections</div>
              <div className="stat-value">{adminDocSections.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Indexed Files</div>
              <div className="stat-value">{adminDocFiles.length}</div>
            </div>
          </div>
        </div>

        <DocsAssistant />

        <div className="panel anim-1">
          <div className="panel-header">
            <div>
              <div className="panel-title">Core Sections</div>
              <div className="panel-sub">High-level knowledge areas available in the admin docs</div>
            </div>
          </div>
          <div className="docs-section-grid">
            {adminDocSections.map((section) => (
              <div className="docs-card" key={section.id}>
                <div className="docs-card-title">{section.title}</div>
                <div className="docs-card-copy">{section.summary}</div>
                <div className="docs-bullet-list">
                  {section.bullets.map((bullet) => (
                    <div key={bullet} className="docs-inline-item">{bullet}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel anim-2">
          <div className="panel-header">
            <div>
              <div className="panel-title">File Map</div>
              <div className="panel-sub">Quick brief of what is present in which file</div>
            </div>
          </div>
          <div className="docs-file-grid">
            {adminDocFiles.map((file) => (
              <div key={file.path} className="docs-card">
                <div className="docs-card-area">{file.area}</div>
                <div className="docs-card-title">{file.path}</div>
                <div className="docs-card-copy">{file.summary}</div>
                <div className="docs-inline-wrap">
                  {file.tags.map((tag) => (
                    <span key={tag} className="tag tag-sky">{tag}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
