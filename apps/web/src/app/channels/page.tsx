import { AppShell } from "@/components/AppShell";
import { WhatsAppConnect } from "@/components/WhatsAppConnect";

export default function ChannelsPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-xl space-y-4">
        <div className="animate-fade-up">
          <h2 className="text-2xl font-bold tracking-tight">Channels</h2>
          <p className="mt-1 text-sm text-slate-500">
            Link your messaging apps to Zegbot
          </p>
        </div>
        <WhatsAppConnect />
      </div>
    </AppShell>
  );
}
