import { useEffect, useState } from 'react';

import type { SubagentCharacter } from '../hooks/useExtensionMessages.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { CharacterState, TILE_SIZE } from '../office/types.js';

interface AgentLabelsProps {
  officeState: OfficeState;
  agents: number[];
  agentStatuses: Record<number, string>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: React.RefObject<{ x: number; y: number }>;
  subagentCharacters: SubagentCharacter[];
}

export function AgentLabels({
  officeState,
  agents,
  agentStatuses,
  containerRef,
  zoom,
  panRef,
  subagentCharacters,
}: AgentLabelsProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      setTick((n) => n + 1);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const el = containerRef.current;
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  // Compute device pixel offset (same math as renderFrame, including pan)
  const canvasW = Math.round(rect.width * dpr);
  const canvasH = Math.round(rect.height * dpr);
  const layout = officeState.getLayout();
  const mapW = layout.cols * TILE_SIZE * zoom;
  const mapH = layout.rows * TILE_SIZE * zoom;
  const deviceOffsetX = Math.floor((canvasW - mapW) / 2) + Math.round(panRef.current.x);
  const deviceOffsetY = Math.floor((canvasH - mapH) / 2) + Math.round(panRef.current.y);

  // Build sub-agent label lookup
  const subLabelMap = new Map<number, string>();
  for (const sub of subagentCharacters) {
    subLabelMap.set(sub.id, sub.label);
  }

  // All character IDs to render labels for (regular agents + sub-agents)
  const allIds = [...agents, ...subagentCharacters.map((s) => s.id)];

  return (
    <>
      {allIds.map((id) => {
        const ch = officeState.characters.get(id);
        if (!ch) return null;

        const isSub = ch.isSubagent;

        // Character position: device pixels → CSS pixels (follow sitting offset)
        // Sub-agents get a larger offset to keep the label well above the sprite
        const sittingOffset = ch.state === CharacterState.TYPE ? 6 : 0;
        const verticalOffset = isSub ? 38 : 24;
        const screenX = (deviceOffsetX + ch.x * zoom) / dpr;
        const screenY = (deviceOffsetY + (ch.y + sittingOffset - verticalOffset) * zoom) / dpr;

        const status = agentStatuses[id];
        const isWaiting = status === 'waiting';
        const isActive = ch.isActive;

        let dotColor = 'transparent';
        if (isWaiting) {
          dotColor = 'var(--vscode-charts-yellow, #cca700)';
        } else if (isActive) {
          dotColor = 'var(--vscode-charts-blue, #3794ff)';
        }

        const labelText = subLabelMap.get(id) || `Agent #${id}`;

        return (
          <div
            key={id}
            style={{
              position: 'absolute',
              left: screenX,
              top: screenY - 16,
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              pointerEvents: 'none',
              zIndex: 40,
            }}
          >
            {dotColor !== 'transparent' && (
              <span
                className={isActive && !isWaiting ? 'pixel-agents-pulse' : undefined}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: dotColor,
                  marginBottom: 2,
                }}
              />
            )}
            <span
              style={{
                fontSize: isSub ? '11px' : '18px',
                fontStyle: isSub ? 'italic' : undefined,
                color: isSub ? 'var(--pixel-text-dim)' : 'var(--vscode-foreground)',
                background: 'rgba(30,30,46,0.7)',
                padding: isSub ? '0px 3px' : '1px 4px',
                borderRadius: 2,
                whiteSpace: 'nowrap',
                maxWidth: isSub ? 80 : undefined,
                overflow: isSub ? 'hidden' : undefined,
                textOverflow: isSub ? 'ellipsis' : undefined,
              }}
            >
              {labelText}
            </span>
          </div>
        );
      })}
    </>
  );
}
