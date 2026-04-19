export interface SlotInfo {
  slotId: number;
  port: number;
  displayName: string;
  status: "starting" | "running" | "stopped";
  createdAt: number;
}

export interface CreateSlotRequest {
  displayName: string;
}

export interface CreateSlotResponse {
  slotId: number;
  port: number;
  url: string;
}

export interface CursorPosition {
  file: string;
  anchor: { line: number; ch: number };
  head: { line: number; ch: number };
}

export interface AwarenessState {
  user: {
    name: string;
    color: string;
    slotId: number;
  };
  cursor: CursorPosition | null;
}

export interface RoomInfo {
  name: string;
  participants: number;
}

export function roomName(relativePath: string): string {
  return `file:${relativePath}`;
}
