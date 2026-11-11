import { LoadWindow, windowPhrase } from "../utils/dataWindow";

interface Props {
  loadWindow: LoadWindow;
  onLoadAllTime?: () => void;
}

/** Shown when only recently updated tickets are loaded: open tickets nobody has touched since are
 * missing, which skews anything that counts open work, ages or backlog. */
export default function LimitedWindowNotice({ loadWindow, onLoadAllTime }: Props) {
  const limited = loadWindow.kind === "range" || loadWindow.days > 0;
  if (!limited) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
      <span>
        Only tickets updated in {windowPhrase(loadWindow)} are loaded. Open tickets nobody has touched since are missing, so delivery
        percentages, backlog and ages on this tab can be skewed (a parent whose children were not loaded also counts as a single ticket).
      </span>
      {onLoadAllTime && (
        <button
          onClick={onLoadAllTime}
          className="rounded border border-amber-300 bg-white px-2 py-0.5 font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-transparent dark:text-amber-300"
        >
          Load all time
        </button>
      )}
    </div>
  );
}
