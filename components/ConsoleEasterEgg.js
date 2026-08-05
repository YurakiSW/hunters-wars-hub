"use client";
import { useEffect } from "react";

// Solo per chi apre gli strumenti sviluppatore per curiosità — nessun
// effetto sul sito, solo un messaggio e un indizio, coerente col resto
// degli easter egg (mai spiegati da nessuna parte visibile).
export default function ConsoleEasterEgg() {
  useEffect(() => {
    console.log("%c👹 Ehi, curioso!", "font-size:20px;font-weight:bold;color:#d3a94f;");
    console.log(
      "%cSe stai leggendo questo probabilmente sei il tipo di persona che troverebbe anche un codice segreto nascosto nel sito. Prova con le sole frecce della tastiera 😉",
      "font-size:13px;color:#9376f2;"
    );
  }, []);
  return null;
}
