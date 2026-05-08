"use client";

import { createContext, useContext } from "react";
import type { RunWithLineage, RunLineage } from "../types";

export interface RunContextValue {
	runs: RunWithLineage[];
	lineages: RunLineage[];
	activeRun: RunWithLineage | null;
	hasActiveBuild: boolean;
}

const RunContext = createContext<RunContextValue | null>(null);

export function RunProvider({
	children,
	value,
}: {
	children: React.ReactNode;
	value: RunContextValue;
}) {
	return <RunContext.Provider value={value}>{children}</RunContext.Provider>;
}

export function useRunContext() {
	const ctx = useContext(RunContext);
	if (!ctx) throw new Error("useRunContext must be used within RunProvider");
	return ctx;
}
