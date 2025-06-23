import { Header } from "@/components/Header";
import { RedactionTool } from "@/components/RedactionTool";

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
