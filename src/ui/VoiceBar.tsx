// src/ui/VoiceBar.tsx
// O dock de voz: o composer de texto desce e ELE sobe no lugar.
//
// Formato da referência (app da Claude): uma barra arredondada com [✕] à
// esquerda, a onda no meio e [✓] à direita. Sem relógio, sem pausa, sem
// arrasto — o gesto inteiro virou dois cliques: um pra começar, um pra
// terminar (ou o ✕ pra jogar fora).
//
// O ✓ NÃO envia a mensagem: a voz vira TEXTO no composer, e quem envia é o
// usuário. Por isso é um check, e não um avião de papel.

import { Icon } from "./Icon";
import type { Voice } from "./useVoice";
import { commit, warn } from "./haptics";
import { tr } from "../i18n/tr";

export function VoiceDock({ voice }: { voice: Voice }) {
  const working = voice.state === "working";
  return (
    <div className="corvus-voice-dock">
      <button
        type="button"
        className="corvus-voice-x"
        aria-label={tr("Discard recording")}
        disabled={working}
        onClick={() => {
          warn();
          voice.cancel();
        }}
      >
        <Icon name="x" size={20} />
      </button>

      {working ? (
        <span className="corvus-voice-working">{tr("Transcribing…")}</span>
      ) : (
        // A onda é a única prova de que o microfone está ouvindo: sem ela,
        // mudo e quebrado são a mesma tela.
        <div className="corvus-voice-wave" aria-hidden="true">
          {voice.levels.map((l, i) => (
            <span
              key={i}
              className="corvus-voice-bar"
              style={{ height: `${Math.max(3, Math.round(l * 26))}px` }}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        className="corvus-voice-ok"
        aria-label={tr("Use this transcript")}
        disabled={working}
        onClick={() => {
          commit();
          voice.finish();
        }}
      >
        <Icon name="check" size={22} />
      </button>
    </div>
  );
}
