const COLORS = [
  { cursor: "#f38ba8", selection: "#f38ba833", label: "#f38ba8" },
  { cursor: "#a6e3a1", selection: "#a6e3a133", label: "#a6e3a1" },
  { cursor: "#89b4fa", selection: "#89b4fa33", label: "#89b4fa" },
  { cursor: "#f9e2af", selection: "#f9e2af33", label: "#f9e2af" },
  { cursor: "#cba6f7", selection: "#cba6f733", label: "#cba6f7" },
  { cursor: "#94e2d5", selection: "#94e2d533", label: "#94e2d5" },
  { cursor: "#fab387", selection: "#fab38733", label: "#fab387" },
  { cursor: "#74c7ec", selection: "#74c7ec33", label: "#74c7ec" },
];

export interface UserColors {
  cursor: string;
  selection: string;
  label: string;
}

export function colorsForSlot(slotId: number): UserColors {
  return COLORS[slotId % COLORS.length];
}

export function colorsForUser(name: string): UserColors {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}
