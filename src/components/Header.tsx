import { ShieldCheck } from "lucide-react";

export function Header() {
  return (
    <header className="flex items-center h-16 px-4 shrink-0 md:px-6 border-b bg-card shadow-sm">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-8 w-8 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Redactify</h1>
      </div>
    </header>
  );
}
