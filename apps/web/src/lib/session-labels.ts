"use client";

const LABELS_KEY = "promohub.whatsappSessionLabels";

export function readSessionLabels(): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }

  const raw = window.localStorage.getItem(LABELS_KEY);

  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);

    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

export function readSessionLabel(
  labels: Record<string, string>,
  keys: string[],
  fallback: string,
): string {
  for (const key of keys) {
    const value = labels[key];

    if (value?.trim()) {
      return value;
    }
  }

  return fallback;
}

export function writeSessionLabel(keys: string[], label: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const labels = readSessionLabels();
  const normalizedLabel = label.trim();

  for (const key of keys) {
    if (normalizedLabel) {
      labels[key] = normalizedLabel;
    } else {
      delete labels[key];
    }
  }

  window.localStorage.setItem(LABELS_KEY, JSON.stringify(labels));
}
