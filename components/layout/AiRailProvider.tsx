"use client";

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { SourceContext } from "./ai-rail-types";

type PreviewHandler = (documentId: string, context: SourceContext | null) => void;

type AiRailContextValue = {
  railOpen: boolean;
  setRailOpen: (open: boolean) => void;
  toggleRail: () => void;
  railWidth: number;
  registerPreviewHandler: (handler: PreviewHandler | null) => void;
  openDocumentPreview: (documentId: string, context: SourceContext | null) => void;
};

const AiRailContext = createContext<AiRailContextValue | null>(null);

const OPEN_WIDTH = 390;
const CLOSED_WIDTH = 56;
const STORAGE_KEY = "mj.aiRailOpen";

export function AiRailProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const handlerRef = useRef<PreviewHandler | null>(null);
  const [railOpen, setRailOpenState] = useState(true);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === "0") {
        setRailOpenState(false);
      }
    } catch {
      // Ignore storage failures.
    }
  }, []);

  const setRailOpen = useCallback((open: boolean) => {
    setRailOpenState(open);
    try {
      window.localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
    } catch {
      // Ignore storage failures.
    }
  }, []);

  const toggleRail = useCallback(() => {
    setRailOpenState((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Ignore storage failures.
      }
      return next;
    });
  }, []);

  const registerPreviewHandler = useCallback((handler: PreviewHandler | null) => {
    handlerRef.current = handler;
  }, []);

  const openDocumentPreview = useCallback(
    (documentId: string, context: SourceContext | null) => {
      if (handlerRef.current) {
        handlerRef.current(documentId, context);
        return;
      }

      const params = new URLSearchParams({ doc: documentId });
      if (context?.query) params.set("q", context.query);
      if (context?.token) params.set("token", context.token);
      if (context?.page) params.set("page", String(context.page));
      router.push(`/documents?${params.toString()}`);
    },
    [router]
  );

  const value = useMemo<AiRailContextValue>(
    () => ({
      railOpen,
      setRailOpen,
      toggleRail,
      railWidth: railOpen ? OPEN_WIDTH : CLOSED_WIDTH,
      registerPreviewHandler,
      openDocumentPreview,
    }),
    [openDocumentPreview, railOpen, registerPreviewHandler, setRailOpen, toggleRail]
  );

  return <AiRailContext.Provider value={value}>{children}</AiRailContext.Provider>;
}

export function useAiRail(): AiRailContextValue {
  const context = useContext(AiRailContext);
  if (!context) {
    throw new Error("useAiRail must be used within AiRailProvider");
  }
  return context;
}
