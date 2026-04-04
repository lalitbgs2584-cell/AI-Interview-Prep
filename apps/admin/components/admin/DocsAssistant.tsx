"use client";

import { useMemo, useState } from "react";
import {
  adminDocFiles,
  adminDocSections,
  buildDocAssistantReply,
} from "@/lib/admin-docs";

const STARTER_PROMPTS = [
  'Where can I see user interview videos?',
  'Which file controls admin auth?',
  'Where do I edit admin routes?',
  'How does recording playback work?',
];

export default function DocsAssistant() {
  const [question, setQuestion] = useState('Where can I see user interview videos?');
  const reply = useMemo(() => buildDocAssistantReply(question), [question]);

  return (
    <div className="docs-assistant-shell">
      <div className="docs-assistant-panel">
        <div className="docs-chat-header">
          <div>
            <div className="panel-title">Doc Assistant</div>
            <div className="panel-sub">A lightweight built-in helper for file discovery and flow explanations</div>
          </div>
          <span className="tag tag-accent">Local only</span>
        </div>

        <div className="docs-chat-stack">
          <div className="docs-bubble docs-bubble-user">
            {question}
          </div>
          <div className="docs-bubble docs-bubble-assistant">
            <p>{reply.answer}</p>
            {!!reply.highlights.length && (
              <div className="docs-bubble-list">
                {reply.highlights.map((item) => (
                  <div key={item} className="docs-inline-item">{item}</div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="docs-assistant-input-row">
          <input
            className="input docs-assistant-input"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask where a feature lives, how a flow works, or which file to edit"
          />
        </div>

        <div className="docs-starter-grid">
          {STARTER_PROMPTS.map((prompt) => (
            <button key={prompt} className="filter-chip" onClick={() => setQuestion(prompt)}>
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <div className="docs-assistant-panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Suggested Files</div>
            <div className="panel-sub">The most relevant files for the current question</div>
          </div>
        </div>
        <div className="docs-file-grid">
          {reply.relatedFiles.map((file) => (
            <div key={file.path} className="docs-card">
              <div className="docs-card-area">{file.area}</div>
              <div className="docs-card-title">{file.path}</div>
              <div className="docs-card-copy">{file.summary}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="docs-assistant-panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Popular Sections</div>
            <div className="panel-sub">The top matched doc sections for the current question</div>
          </div>
        </div>
        <div className="docs-section-grid">
          {reply.relatedSections.map((section) => (
            <div key={section.id} className="docs-card">
              <div className="docs-card-title">{section.title}</div>
              <div className="docs-card-copy">{section.summary}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="docs-assistant-panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Doc Index</div>
            <div className="panel-sub">Everything the assistant is currently trained on inside admin docs</div>
          </div>
        </div>
        <div className="docs-inline-wrap">
          {adminDocSections.map((section) => (
            <button key={section.id} className="filter-chip" onClick={() => setQuestion(section.title)}>
              {section.title}
            </button>
          ))}
          {adminDocFiles.slice(0, 6).map((file) => (
            <button key={file.path} className="filter-chip" onClick={() => setQuestion(file.path)}>
              {file.path}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
