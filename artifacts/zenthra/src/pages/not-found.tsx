import { Link } from 'wouter';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-background px-4 text-foreground">
      <div className="mx-4 w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl border border-blue-500/20 bg-blue-500/5 text-blue-400">
          <Compass size={22} />
        </div>
        <h1 className="font-display text-xl font-semibold tracking-[-.02em] text-slate-100">Nothing here to research</h1>
        <p className="mt-2 text-sm text-slate-500">This page doesn't exist. Try starting a new question instead.</p>
        <Link
          href="/"
          className="mt-5 inline-flex items-center justify-center rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-400"
        >
          Back to Zenthra
        </Link>
      </div>
    </div>
  );
}
