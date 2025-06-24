'use client';

import { Header } from "@/components/Header";
import dynamic from 'next/dynamic';
import { Skeleton } from "@/components/ui/skeleton";

const RedactionToolLoading = () => (
    <div className="flex flex-col gap-6">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-[70vh] w-full rounded-lg" />
    </div>
);

const RedactionTool = dynamic(() => import('@/components/RedactionTool').then(mod => mod.RedactionTool), {
  ssr: false,
  loading: () => <RedactionToolLoading />,
});

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <Header />
      <main className="flex-1 p-4 sm:p-6 md:p-8">
        <RedactionTool />
      </main>
    </div>
  );
}
