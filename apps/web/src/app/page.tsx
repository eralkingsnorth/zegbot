import { AppShell } from "@/components/AppShell";
import { HomeAi } from "@/components/HomeAi";

export default function Home() {
  return (
    <AppShell fill>
      <div className="mx-auto flex h-full min-h-0 max-w-2xl flex-col">
        <HomeAi />
      </div>
    </AppShell>
  );
}
