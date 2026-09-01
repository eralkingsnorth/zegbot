import { AiChat } from "@/components/AiChat";
import { WhatsAppConnect } from "@/components/WhatsAppConnect";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <h1 className="text-xl font-bold text-zinc-900">Zegbot</h1>
          <span className="text-sm text-zinc-500">Messaging AI Hub</span>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8 md:grid-cols-2">
        <WhatsAppConnect />
        <AiChat />
      </main>
    </div>
  );
}
