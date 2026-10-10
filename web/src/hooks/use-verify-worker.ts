"use client";

import { useCallback, useEffect, useRef } from "react";
import { CancelledError } from "@/hooks/use-generator-worker";
import type { VerificationResult } from "@/lib/verification/types";
import type { VerifyWorkerRequest, VerifyWorkerResponse } from "@/workers/verify.worker";

type Pending = {
  resolve: (value: VerificationResult) => void;
  reject: (error: Error) => void;
};

/** Distributes Omit over the request union, so each variant keeps its own fields. */
type Job = VerifyWorkerRequest extends infer R
  ? R extends VerifyWorkerRequest
    ? Omit<R, "id">
    : never
  : never;

/** Lazily spins up the verification Web Worker and exposes a promise-based call. */
export function useVerifyWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, Pending>());
  const nextId = useRef(1);

  useEffect(() => {
    const map = pending.current;
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      for (const p of map.values()) p.reject(new CancelledError());
      map.clear();
    };
  }, []);

  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      const worker = new Worker(new URL("../workers/verify.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (event: MessageEvent<VerifyWorkerResponse>) => {
        const data = event.data;
        const p = pending.current.get(data.id);
        if (!p) return;
        pending.current.delete(data.id);
        if (data.ok) p.resolve(data.result);
        else p.reject(new Error(data.error));
      };
      worker.onerror = (event) => {
        for (const p of pending.current.values()) {
          p.reject(new Error(event.message || "The verification worker crashed."));
        }
        pending.current.clear();
        workerRef.current?.terminate();
        workerRef.current = null;
      };
      workerRef.current = worker;
    }
    return workerRef.current;
  }, []);

  return useCallback(
    (job: Job) =>
      new Promise<VerificationResult>((resolve, reject) => {
        const id = nextId.current++;
        pending.current.set(id, { resolve, reject });
        getWorker().postMessage({ ...job, id } as VerifyWorkerRequest);
      }),
    [getWorker],
  );
}
