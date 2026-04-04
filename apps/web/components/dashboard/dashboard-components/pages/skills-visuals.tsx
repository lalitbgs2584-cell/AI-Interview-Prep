"use client";

import { useMemo, useState } from "react";

interface SkillNodeInput {
  id: string;
  name: string;
  category: string;
}

interface SkillConstellationProps {
  skills: SkillNodeInput[];
}

interface SkillCategoryBarsProps {
  categoryAverages: Record<string, number>;
}

const CONSTELLATION_COLORS = ["#8b5cf6", "#10b981", "#f97316", "#22c55e", "#38bdf8", "#f59e0b"];

function categoryColor(category: string, categories: string[]) {
  const index = categories.indexOf(category);
  return CONSTELLATION_COLORS[index % CONSTELLATION_COLORS.length] ?? "#8b5cf6";
}

function buildConstellation(skills: SkillNodeInput[]) {
  const grouped = skills.reduce<Record<string, SkillNodeInput[]>>((acc, skill) => {
    const category = skill.category || "Other";
    if (!acc[category]) acc[category] = [];
    acc[category].push(skill);
    return acc;
  }, {});

  const categories = Object.keys(grouped);
  const centerX = 250;
  const centerY = 210;
  const orbit = Math.max(110, categories.length * 18);

  const nodes = categories.flatMap((category, categoryIndex) => {
    const categorySkills = grouped[category] ?? [];
    const categoryAngle = (Math.PI * 2 * categoryIndex) / Math.max(categories.length, 1);
    const anchorX = centerX + Math.cos(categoryAngle) * orbit;
    const anchorY = centerY + Math.sin(categoryAngle) * orbit * 0.72;
    const color = categoryColor(category, categories);

    return categorySkills.map((skill, skillIndex) => {
      const ring = 34 + (skillIndex % 3) * 14;
      const localAngle = (Math.PI * 2 * skillIndex) / Math.max(categorySkills.length, 1);
      const x = anchorX + Math.cos(localAngle) * ring;
      const y = anchorY + Math.sin(localAngle) * ring;

      return {
        ...skill,
        color,
        x,
        y,
        r: Math.max(16, Math.min(28, 16 + skill.name.length * 0.4)),
      };
    });
  });

  const connections: Array<{ from: string; to: string; color: string }> = [];
  categories.forEach((category) => {
    const categoryNodes = nodes.filter((node) => node.category === category);
    for (let index = 1; index < categoryNodes.length; index += 1) {
      connections.push({
        from: categoryNodes[index - 1]!.id,
        to: categoryNodes[index]!.id,
        color: categoryNodes[index]!.color,
      });
    }
  });

  const leadNodes = categories
    .map((category) => nodes.find((node) => node.category === category))
    .filter((node): node is (typeof nodes)[number] => Boolean(node));

  for (let index = 1; index < leadNodes.length; index += 1) {
    connections.push({
      from: leadNodes[index - 1]!.id,
      to: leadNodes[index]!.id,
      color: "rgba(255,255,255,0.18)",
    });
  }

  return { nodes, connections, categories };
}

export function SkillCategoryBars({ categoryAverages }: SkillCategoryBarsProps) {
  const categories = Object.entries(categoryAverages).sort((left, right) => right[1] - left[1]);

  if (!categories.length) {
    return (
      <div style={{ color: "var(--text-2)", fontSize: "0.85rem" }}>
        Complete more interviews to unlock category-level performance bars.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      {categories.map(([label, score], index) => {
        const color = CONSTELLATION_COLORS[index % CONSTELLATION_COLORS.length] ?? "#8b5cf6";
        return (
          <button
            key={label}
            type="button"
            style={{
              border: "1px solid var(--border)",
              background: "var(--bg2)",
              borderRadius: "var(--r-md)",
              padding: "0.95rem 1rem",
              textAlign: "left",
              cursor: "default",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", marginBottom: "0.5rem" }}>
              <div>
                <div style={{ fontSize: "0.8rem", color: color, fontWeight: 700 }}>{label}</div>
                <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>Interview performance category</div>
              </div>
              <div style={{ fontSize: "0.76rem", color: "var(--text)", fontWeight: 700 }}>avg {score}%</div>
            </div>
            <div style={{ display: "flex", height: 14, borderRadius: 999, overflow: "hidden", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div
                style={{
                  width: `${Math.min(100, score)}%`,
                  background: `linear-gradient(90deg, ${color}cc, ${color})`,
                }}
              />
              <div style={{ flex: 1, background: "transparent" }} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function SkillConstellation({ skills }: SkillConstellationProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [hoveredSkillId, setHoveredSkillId] = useState<string | null>(null);

  const { nodes, connections, categories } = useMemo(() => buildConstellation(skills), [skills]);
  const visibleNodes = activeCategory
    ? nodes.filter((node) => node.category === activeCategory)
    : nodes;
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const visibleConnections = connections.filter(
    (connection) => visibleIds.has(connection.from) && visibleIds.has(connection.to),
  );
  const hoveredNode = nodes.find((node) => node.id === hoveredSkillId) ?? visibleNodes[0] ?? null;

  if (!nodes.length) {
    return (
      <div style={{ color: "var(--text-2)", fontSize: "0.85rem" }}>
        Upload a resume to populate the constellation.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        <button
          type="button"
          onClick={() => setActiveCategory(null)}
          style={{
            padding: "0.4rem 0.8rem",
            borderRadius: 999,
            border: `1px solid ${activeCategory === null ? "rgba(255,255,255,0.2)" : "var(--border)"}`,
            background: activeCategory === null ? "rgba(255,255,255,0.08)" : "var(--bg2)",
            color: "var(--text)",
            fontSize: "0.74rem",
            cursor: "pointer",
          }}
        >
          All categories
        </button>
        {categories.map((category) => {
          const color = categoryColor(category, categories);
          const active = activeCategory === category;
          return (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(active ? null : category)}
              style={{
                padding: "0.4rem 0.8rem",
                borderRadius: 999,
                border: `1px solid ${active ? `${color}66` : "var(--border)"}`,
                background: active ? `${color}22` : "var(--bg2)",
                color: active ? color : "var(--text)",
                fontSize: "0.74rem",
                cursor: "pointer",
              }}
            >
              {category}
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(220px, 0.8fr)", gap: "1rem", alignItems: "start" }}>
        <div
          style={{
            borderRadius: "var(--r-lg)",
            border: "1px solid var(--border)",
            background: "radial-gradient(circle at top, rgba(139,92,246,0.16), rgba(10,12,18,0.92) 55%)",
            padding: "0.75rem",
            minHeight: 440,
          }}
        >
          <svg viewBox="0 0 500 420" style={{ width: "100%", height: "100%" }}>
            {visibleConnections.map((connection, index) => {
              const from = nodes.find((node) => node.id === connection.from);
              const to = nodes.find((node) => node.id === connection.to);
              if (!from || !to) return null;

              return (
                <line
                  key={`${connection.from}-${connection.to}-${index}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={connection.color}
                  strokeOpacity={hoveredSkillId ? 0.38 : 0.18}
                />
              );
            })}

            {visibleNodes.map((node) => {
              const isHovered = node.id === hoveredSkillId;
              return (
                <g
                  key={node.id}
                  onMouseEnter={() => setHoveredSkillId(node.id)}
                  onMouseLeave={() => setHoveredSkillId(null)}
                  style={{ cursor: "pointer" }}
                >
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.r + 5}
                    fill={node.color}
                    opacity={isHovered ? 0.28 : 0.12}
                  />
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.r}
                    fill="rgba(26,26,26,0.88)"
                    stroke={node.color}
                    strokeWidth={isHovered ? 2.2 : 1.2}
                  />
                  <text
                    x={node.x}
                    y={node.y - 2}
                    textAnchor="middle"
                    fill="#ecfeff"
                    fontSize={Math.max(8, Math.min(12, node.r * 0.44))}
                    fontWeight={700}
                  >
                    {node.name.length > 14 ? `${node.name.slice(0, 12)}...` : node.name}
                  </text>
                  <text
                    x={node.x}
                    y={node.y + 12}
                    textAnchor="middle"
                    fill={node.color}
                    fontSize="8"
                  >
                    {node.category}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div
          style={{
            borderRadius: "var(--r-lg)",
            border: "1px solid var(--border)",
            background: "var(--bg2)",
            padding: "1rem",
          }}
        >
          <div style={{ fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.55rem" }}>
            Live focus
          </div>
          {hoveredNode ? (
            <>
              <div style={{ fontSize: "1rem", fontWeight: 700, color: hoveredNode.color, marginBottom: "0.3rem" }}>
                {hoveredNode.name}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-2)", marginBottom: "0.85rem", lineHeight: 1.6 }}>
                Clustered under <strong>{hoveredNode.category}</strong>. Hover the constellation to inspect related strengths in the same cluster.
              </div>
            </>
          ) : null}

          <div style={{ display: "grid", gap: "0.65rem" }}>
            {(activeCategory ? visibleNodes : nodes.slice(0, 6)).map((node) => (
              <button
                key={`detail-${node.id}`}
                type="button"
                onMouseEnter={() => setHoveredSkillId(node.id)}
                onMouseLeave={() => setHoveredSkillId(null)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.8rem",
                  padding: "0.7rem 0.8rem",
                  borderRadius: "var(--r-md)",
                  border: `1px solid ${node.color}2b`,
                  background: `${node.color}14`,
                  color: "var(--text)",
                  cursor: "pointer",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: node.color }} />
                  <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>{node.name}</span>
                </span>
                <span style={{ fontSize: "0.72rem", color: node.color }}>{node.category}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
