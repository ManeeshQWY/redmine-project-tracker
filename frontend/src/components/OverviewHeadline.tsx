import { useMemo } from "react";
import { Issue } from "../types/issue";
import { countNotClosed } from "../utils/aggregations";
import { quickCounts } from "../utils/insights";
import { summarizeDelivery } from "../utils/stages";

interface Props {
  issues: Issue[];
  devDoneCounts: boolean;
}

const strong = "font-semibold text-slate-900 dark:text-slate-50";

/** The page in one sentence: how far along, what is still open, and the two things that need an owner. */
export default function OverviewHeadline({ issues, devDoneCounts }: Props) {
  const text = useMemo(() => {
    const delivery = summarizeDelivery(issues, devDoneCounts);
    const quick = quickCounts(issues, new Date());
    return { delivery, quick, open: countNotClosed(issues) };
  }, [issues, devDoneCounts]);

  if (issues.length === 0) return null;
  const { delivery, quick, open } = text;
  return (
    <p className="text-base leading-6 text-slate-700 dark:text-slate-300">
      {delivery.deliveredPercent !== null && (
        <>
          <span className={strong}>{Math.round(delivery.deliveredPercent)}% delivered</span> ({delivery.delivered.toLocaleString()} of {delivery.tickets.toLocaleString()} tickets).{" "}
        </>
      )}
      <span className={strong}>{open.toLocaleString()}</span> still open: <span className={strong}>{quick.unassigned.toLocaleString()}</span> with no owner and{" "}
      <span className={strong}>{quick.noEstimate.toLocaleString()}</span> with no estimate.{" "}
      <span className={quick.overdue > 0 ? "font-semibold text-rose-700 dark:text-rose-300" : "font-semibold text-emerald-700 dark:text-emerald-400"}>
        {quick.overdue.toLocaleString()} overdue.
      </span>
    </p>
  );
}
