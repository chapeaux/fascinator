import { PORT_RANGE_START, PORT_RANGE_END } from "@fascinator/shared/constants.ts";

export class PortAllocator {
  private used = new Set<number>();

  allocate(): number {
    for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
      if (!this.used.has(port)) {
        this.used.add(port);
        return port;
      }
    }
    throw new Error("No available ports");
  }

  release(port: number): void {
    this.used.delete(port);
  }

  isAllocated(port: number): boolean {
    return this.used.has(port);
  }

  get allocatedCount(): number {
    return this.used.size;
  }
}
