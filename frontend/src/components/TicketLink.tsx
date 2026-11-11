/** A ticket number that opens the ticket in Redmine (plain text when the Redmine address is unknown). */
export default function TicketLink({ id, redmineBaseUrl }: { id: number; redmineBaseUrl: string }) {
  if (!redmineBaseUrl) return <span className="font-medium">#{id}</span>;
  return (
    <a
      href={`${redmineBaseUrl}/issues/${id}`}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-brand-600 hover:underline dark:text-brand-400"
      onClick={(e) => e.stopPropagation()}
    >
      #{id}
    </a>
  );
}
