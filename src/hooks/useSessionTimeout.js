import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

const TIMEOUT_MS = 15 * 60 * 1000; // 15 minutos em milissegundos

export function useSessionTimeout() {
  const timerRef = useRef(null);

  const resetTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      alert("Sessão encerrada por inatividade por motivos de segurança.");
      await supabase.auth.signOut();
      window.location.href = "/";
    }, TIMEOUT_MS);
  };

  useEffect(() => {
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];

    const handleUserActivity = () => resetTimer();

    // Inicia o timer na montagem do componente
    resetTimer();

    // Adiciona ouvintes para interações do usuário
    events.forEach((event) => {
      window.addEventListener(event, handleUserActivity);
    });

    // Limpa ouvintes ao desmontar o componente
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((event) => {
        window.removeEventListener(event, handleUserActivity);
      });
    };
  }, []);
}
