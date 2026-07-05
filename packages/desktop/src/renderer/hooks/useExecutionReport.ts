import { useState, useEffect, useCallback } from "react";
import type { JarvisEvent } from "@promptwright/core";
import type { ExecutionReport, ExecutionStep } from "../types";

interface UseExecutionReportReturn {
  report: ExecutionReport | null;
  isActive: boolean;
  clearReport: () => void;
}

/**
 * Hook to manage execution report state from events
 */
export function useExecutionReport(): UseExecutionReportReturn {
  const [report, setReport] = useState<ExecutionReport | null>(null);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const handleEvent = (event: JarvisEvent) => {
      switch (event.type) {
        case "execution_step":
          setIsActive(true);
          setReport((prevReport) => {
            // If no report exists yet, create a new one
            if (!prevReport || prevReport.id !== event.reportId) {
              return {
                id: event.reportId,
                testName: "Test Execution",
                status: "running",
                startTime: event.step.timestamp,
                steps: [event.step],
              };
            }

            // Update existing report with new step
            const existingStepIndex = prevReport.steps.findIndex(
              (s) => s.id === event.step.id
            );

            if (existingStepIndex >= 0) {
              // Update existing step
              const updatedSteps = [...prevReport.steps];
              updatedSteps[existingStepIndex] = event.step;
              return {
                ...prevReport,
                steps: updatedSteps,
              };
            } else {
              // Add new step
              return {
                ...prevReport,
                steps: [...prevReport.steps, event.step],
              };
            }
          });
          break;

        case "execution_complete":
          setIsActive(false);
          setReport(event.report);
          break;

        case "session_error":
          // Mark report as failed if there was an error
          setIsActive(false);
          setReport((prevReport) => {
            if (prevReport) {
              return {
                ...prevReport,
                status: "failed",
                endTime: Date.now(),
                summary: event.error,
              };
            }
            return prevReport;
          });
          break;
      }
    };

    const unsubscribe = window.jarvis.onEvent(handleEvent);
    return unsubscribe;
  }, []);

  const clearReport = useCallback(() => {
    setReport(null);
    setIsActive(false);
  }, []);

  return {
    report,
    isActive,
    clearReport,
  };
}
