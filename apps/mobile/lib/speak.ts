import * as Speech from "expo-speech";

export function ttsText(text: string): string {
  const clean = text.replace(/\n+/g, ". ").trim();
  if (clean.length <= 280) return clean;
  const cut = clean.slice(0, 280);
  const last = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
  return (last > 80 ? cut.slice(0, last + 1) : cut.trim()) + "…";
}

export function speakText(text: string) {
  Speech.stop();
  Speech.speak(ttsText(text), { language: "en-US", rate: 1 });
}

export function stopSpeaking() {
  Speech.stop();
}
