import { FormEvent, useState } from "react";
import { ApiError, login } from "../services/api";
import { CurrentUser } from "../services/api";

interface Props {
  onLoggedIn: (user: CurrentUser) => void;
}

export default function LoginScreen({ onLoggedIn }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const { user } = await login(apiKey.trim());
      onLoggedIn(user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to log in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Redmine Project Tracker</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Sign in with your own Redmine API key.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Redmine API Key</label>
            <input
              type="password"
              autoComplete="off"
              autoFocus
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your API key…"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !apiKey.trim()}
            className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p className="mt-4 text-xs leading-relaxed text-slate-400 dark:text-slate-500">
          Find your key in Redmine under <span className="font-medium text-slate-500 dark:text-slate-400">My account → API access key</span>.
          Your key is sent once to sign in and is never stored in this browser — only a session
          cookie is kept.
        </p>
      </div>
    </div>
  );
}
