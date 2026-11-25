'use strict';
// Built-in breakdown used when no AI provider is configured or the provider fails. Pure and deterministic.
function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

function breakDownTask({ instructions = '', priority = 'medium' }) {
  const base = priority === 'high' ? 45 : priority === 'low' ? 20 : 30;
  const lines = String(instructions)
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8)
    .slice(0, 6);

  if (lines.length >= 2) {
    return lines.map((line) => ({
      title: truncate(line.replace(/[.!?]+$/, ''), 120),
      estimateMinutes: clamp(base + Math.min(40, line.length / 4), 15, 120),
    }));
  }
  return [
    { title: 'Read the task and list what is required', estimateMinutes: 15 },
    { title: 'Work on the first draft or first part', estimateMinutes: clamp(base, 15, 120) },
    { title: 'Review against the instructions and revise', estimateMinutes: clamp(base - 5, 15, 120) },
    { title: 'Attach supporting files and submit', estimateMinutes: 10 },
  ];
}

module.exports = { breakDownTask };
