import { AlertTriangle } from "lucide-react";
export function ErrorAlert({ message }: { message?: string }) {
  if (!message) return null;
  return <div className="mb-4 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"><AlertTriangle size={16} /> {message}</div>;
}
