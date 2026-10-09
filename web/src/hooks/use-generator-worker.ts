"use client";

import { useCallback, useEffect, useRef } from "react";
import type { GenerateOptions, GenerateResult } from "@/lib/generator/generate";
import type { WorkerRequest, WorkerResponse } from "@/workers/generator.worker";

/** Raised for requests still in flight when the component unmounts. */
export class CancelledError extends Error {
  constructor() {
    super("Generation was cancelled.");
    this.name = "CancelledError";
  }
}

type Pending = {
  resolve: (value: { result: GenerateResult; ms: number }) => void;
  reject: (error: Error) => void;
};

/** Lazily spins up the generator Web Worker and exposes a promise-based call. */
export function useGeneratorWorker() {
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
      const worker = new Worker(
        new URL("../workers/generator.worker.ts", import.meta.url),
        {
          type: "module",
        },
      );
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const data = event.data;
        const p = pending.current.get(data.id);
        if (!p) return;
        pending.current.delete(data.id);
        if (data.ok) p.resolve({ result: data.result, ms: data.ms });
        else p.reject(new Error(data.error));
      };
      worker.onerror = (event) => {
        for (const p of pending.current.values()) {
          p.reject(new Error(event.message || "The generator worker crashed."));
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
    (options: GenerateOptions) =>
      new Promise<{ result: GenerateResult; ms: number }>((resolve, reject) => {
        const id = nextId.current++;
        pending.current.set(id, { resolve, reject });
        const request: WorkerRequest = { id, options };
        getWorker().postMessage(request);
      }),
    [getWorker],
  );
}
