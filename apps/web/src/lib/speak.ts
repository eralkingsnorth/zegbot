/** Shorten long AI replies before reading aloud. */
export function ttsText(text: string): string {
  const clean = text.replace(/\n+/g, ". ").trim();
  if (clean.length <= 280) return clean;
  const cut = clean.slice(0, 280);
  const last = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
  return (last > 80 ? cut.slice(0, last + 1) : cut.trim()) + "…";
}

export function speakText(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(ttsText(text));
  utterance.lang = "en-US";
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}
