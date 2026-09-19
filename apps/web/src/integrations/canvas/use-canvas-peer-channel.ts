import { useCallback, useEffect, useRef } from "react";
import type { Snapshot } from "../../domain/project/project";

type CanvasPeerMessage = {
  source: string;
  snapshot: Snapshot;
};

export function useCanvasPeerChannel(
  workspaceId: string,
  onPeerSnapshot: (snapshot: Snapshot) => void,
) {
  const sourceId = useRef(crypto.randomUUID());
  const channelRef = useRef<BroadcastChannel | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queuedRef = useRef<Snapshot | null>(null);
  const onPeerSnapshotRef = useRef(onPeerSnapshot);
  onPeerSnapshotRef.current = onPeerSnapshot;

  const publish = useCallback((snapshot: Snapshot) => {
    if (typeof BroadcastChannel === "undefined") return;
    queuedRef.current = snapshot;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const channel = channelRef.current;
      const queued = queuedRef.current;
      queuedRef.current = null;
      timerRef.current = null;
      if (channel && queued) {
        channel.postMessage({
          source: sourceId.current,
          snapshot: queued,
        } satisfies CanvasPeerMessage);
      }
    }, 80);
  }, []);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return undefined;

    const channel = new BroadcastChannel(`notespace.canvas:${workspaceId}`);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<CanvasPeerMessage>) => {
      const message = event.data;
      if (
        !message ||
        message.source === sourceId.current ||
        message.snapshot?.format !== "excalidraw"
      ) {
        return;
      }
      onPeerSnapshotRef.current(message.snapshot);
    };

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      queuedRef.current = null;
      channelRef.current = null;
      channel.close();
    };
  }, [workspaceId]);

  return publish;
}
