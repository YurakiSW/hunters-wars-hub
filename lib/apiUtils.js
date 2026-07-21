// Legge il corpo JSON di una richiesta senza far esplodere la route con un
// errore 500 grezzo se il corpo è vuoto o malformato — capitava con
// richieste anomale (o test manuali) e il sito rispondeva con una pagina
// di errore invece di un messaggio chiaro.
export async function safeJson(request) {
  try {
    return { data: await request.json(), error: null };
  } catch {
    return { data: null, error: "Richiesta non valida (corpo JSON mancante o malformato)." };
  }
}
