import { useEffect, useRef, useState } from "react";
import { useSiteEffectsStore } from "./siteEffectsStore";
import { GaplessLoop } from "./GaplessLoop";
import { getCurrentSfxVolume } from "./volumeMixerStore";

const SEND_LABEL = "Send";
const FALLBACK_SPLASH = "Write a message...";

export function useChatHudReveal(triggerKey: string | undefined) {
  const [revealedPlaceholder, setRevealedPlaceholder] = useState("");
  const [revealedSend, setRevealedSend] = useState("");
  const [placeholderText, setPlaceholderText] = useState(FALLBACK_SPLASH);
  const [isRevealing, setIsRevealing] = useState(false);
  const loopRef = useRef<GaplessLoop | null>(null);

  useEffect(() => {
    if (!triggerKey) return;
    const { chatHudRevealRate, chatHudSfxUrl, chatSplashMessages } = useSiteEffectsStore.getState();
    const splash = chatSplashMessages.length > 0 ? chatSplashMessages[Math.floor(Math.random() * chatSplashMessages.length)] : FALLBACK_SPLASH;
    setPlaceholderText(splash);
    setRevealedPlaceholder("");
    setRevealedSend("");
    setIsRevealing(true);

    if (chatHudSfxUrl) {
      if (!loopRef.current) loopRef.current = new GaplessLoop();
      loopRef.current.play(chatHudSfxUrl).then(() => loopRef.current?.fadeTo(0.35 * getCurrentSfxVolume()));
    }

    let cancelled = false;
    let charIndex = 0;
    const rate = Math.max(5, chatHudRevealRate);

    function revealPlaceholderStep() {
      if (cancelled) return;
      charIndex++;
      setRevealedPlaceholder(splash.slice(0, charIndex));
      if (charIndex < splash.length) {
        setTimeout(revealPlaceholderStep, rate);
      } else {
        charIndex = 0;
        setTimeout(revealSendStep, rate * 3); // a small pause before Send starts
      }
    }

    function revealSendStep() {
      if (cancelled) return;
      charIndex++;
      setRevealedSend(SEND_LABEL.slice(0, charIndex));
      if (charIndex < SEND_LABEL.length) {
        setTimeout(revealSendStep, rate);
      } else {
        setIsRevealing(false);
        loopRef.current?.fadeTo(0);
      }
    }

    const startTimer = setTimeout(revealPlaceholderStep, rate);

    return () => {
      cancelled = true;
      clearTimeout(startTimer);
      loopRef.current?.fadeTo(0);
    };
  }, [triggerKey]);

  useEffect(() => {
    return () => loopRef.current?.dispose();
  }, []);

  return { revealedPlaceholder, revealedSend, placeholderText, isRevealing };
}
