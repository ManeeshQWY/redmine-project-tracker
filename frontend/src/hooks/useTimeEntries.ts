import { useEffect, useRef, useState } from "react";
import { ALL_PROJECTS, ApiError, getTimeEntries, isAbortError } from "../services/api";
import { TimeEntry } from "../types/issue";
import { LoadWindow, windowKey } from "../utils/dataWindow";

interface State {
  entries: TimeEntry[] | null;
  loading: boolean;
  error: string | null;
}

/**
 * Loads a project's time entries in the background for views that are better with them but work
 * without (staleness, timesheet). Not loaded for "All Projects" — that is a very large fetch — and
 * cancelled, server side too, when the project or period changes or the view goes away.
 */
export function useTimeEntries(
  projectIdentifier: string,
  loadWindow: LoadWindow,
  onSessionExpired: () => void,
  enabled = true,
  refreshTick = 0
): State {
  const [state, setState] = useState<State>({ entries: null, loading: false, error: null });
  // What the last load was for, so a change of `refreshTick` alone (the Refresh button) can skip the server's cache.
  const last = useRef<{ context: string; tick: number } | null>(null);
  const windowId = windowKey(loadWindow);

  useEffect(() => {
    if (!enabled || projectIdentifier === ALL_PROJECTS) {
      setState({ entries: null, loading: false, error: null });
      return;
    }
    const controller = new AbortController();
    const context = `${projectIdentifier}|${windowId}`;
    const force = last.current !== null && last.current.context === context && last.current.tick !== refreshTick;
    last.current = { context, tick: refreshTick };
    setState({ entries: null, loading: true, error: null });
    getTimeEntries(projectIdentifier, force, loadWindow, controller.signal)
      .then((result) => setState({ entries: result.timeEntries, loading: false, error: null }))
      .catch((err) => {
        if (isAbortError(err)) return;
        if (err instanceof ApiError && err.status === 401) {
          onSessionExpired();
          return;
        }
        setState({ entries: null, loading: false, error: err instanceof ApiError ? err.message : "Unable to load time entries." });
      });
    return () => controller.abort();
    // loadWindow is represented by windowId; onSessionExpired is deliberately not a dependency
    // (a new closure every render would restart the load)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIdentifier, windowId, enabled, refreshTick]);

  return state;
}
