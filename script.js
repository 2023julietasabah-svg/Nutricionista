// Elementos del DOM
const zonaDeChat = document.getElementById("zona-de-chat");
const zonaDeEscritura = document.getElementById("zona-de-escritura");
const campoMensaje = document.getElementById("campo-mensaje");
const botonEnviar = document.getElementById("boton-enviar");
const contadorCaracteres = document.getElementById("contador-caracteres");

// Constantes de control
const MAX_CARACTERES = 500;
const TIEMPO_LIMITE_MS = 30000;
const PAUSA_MINIMA_MS = 1500;

// Variable en memoria como respaldo si localStorage falla
let sessionIdMemoria = null;
let ultimoEnvioTimestamp = 0;

/**
 * Obtiene o genera un sessionId único para mantener la conversación.
 */
function obtenerSessionId() {
  const claveStorage = "nutricionista_session_id";

  try {
    const guardado = localStorage.getItem(claveStorage);
    if (guardado) {
      return guardado;
    }
  } catch (error) {
    // Si localStorage está bloqueado, continuamos con memoria
  }

  if (sessionIdMemoria) {
    return sessionIdMemoria;
  }

  const nuevoId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

  sessionIdMemoria = nuevoId;

  try {
    localStorage.setItem(claveStorage, nuevoId);
  } catch (error) {
    // Si falla el guardado en disco, queda en sessionIdMemoria
  }

  return nuevoId;
}

const sessionId = obtenerSessionId();

/**
 * Agrega una burbuja de mensaje a la zona de chat usando solo textContent.
 */
function agregarBurbuja(texto, tipo) {
  const burbuja = document.createElement("div");
  burbuja.classList.add("mensaje", tipo);

  const parrafo = document.createElement("p");
  parrafo.textContent = texto;

  burbuja.appendChild(parrafo);
  zonaDeChat.appendChild(burbuja);
  zonaDeChat.scrollTop = zonaDeChat.scrollHeight;

  return burbuja;
}

/**
 * Extrae el texto válido según el contrato de respuestas de Make.
 */
function procesarRespuestaServidor(textoCrudo) {
  if (!textoCrudo || textoCrudo.trim() === "") {
    return "(respuesta vacía)";
  }

  try {
    const datos = JSON.parse(textoCrudo);

    if (datos && typeof datos === "object" && !Array.isArray(datos)) {
      const propiedades = ["response", "respuesta", "message", "mensaje"];
      for (const prop of propiedades) {
        if (typeof datos[prop] === "string" && datos[prop].trim() !== "") {
          return datos[prop];
        }
      }
      return "Make respondió, pero sin el campo response";
    }

    return textoCrudo;
  } catch (error) {
    // Si no es JSON válido, devolver el texto tal cual (ej. "Accepted")
    return textoCrudo;
  }
}

/**
 * Activa o desactiva los controles de entrada.
 */
function alternarControles(deshabilitado) {
  campoMensaje.disabled = deshabilitado;
  botonEnviar.disabled = deshabilitado;
}

/**
 * Envía el mensaje al webhook de Make gestionando estados y errores.
 */
async function enviarMensaje(textoUsuario) {
  // Validación de URL de webhook
  if (
    typeof WEBHOOK_URL === "undefined" ||
    !WEBHOOK_URL ||
    WEBHOOK_URL.trim() === "" ||
    WEBHOOK_URL.includes("ACA VA")
  ) {
    agregarBurbuja("Falta pegar la URL de tu webhook en config.js", "error");
    return;
  }

  alternarControles(true);
  const burbujaCargando = agregarBurbuja("Nutricionista está escribiendo...", "cargando");

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIEMPO_LIMITE_MS);

  const cargaUtil = {
    sessionId: sessionId,
    mensaje: textoUsuario,
    fecha: new Date().toISOString()
  };

  try {
    const respuesta = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(cargaUtil),
      signal: controlador.signal
    });

    const textoRespuesta = await respuesta.text();
    burbujaCargando.remove();

    if (!respuesta.ok) {
      agregarBurbuja(
        `Make respondió con error (código ${respuesta.status}). Revisá que tu escenario esté en Active o que hayas apretado Run once.`,
        "error"
      );
      return;
    }

    const mensajeFinal = procesarRespuestaServidor(textoRespuesta);
    agregarBurbuja(mensajeFinal, "agente");
  } catch (error) {
    burbujaCargando.remove();

    if (error.name === "AbortError") {
      agregarBurbuja(
        "Se agotó el tiempo de espera (30 segundos). Intentá nuevamente.",
        "error"
      );
    } else {
      agregarBurbuja(
        "Error de red al conectar con el servidor. Verificá tu conexión a internet.",
        "error"
      );
    }
  } finally {
    clearTimeout(temporizador);
    ultimoEnvioTimestamp = Date.now();
    alternarControles(false);
    campoMensaje.focus();
  }
}

/**
 * Maneja el envío del formulario y valida longitud y pausa mínima.
 */
function manejarEnvio(evento) {
  evento.preventDefault();

  const ahora = Date.now();
  if (ahora - ultimoEnvioTimestamp < PAUSA_MINIMA_MS) {
    return;
  }

  const texto = campoMensaje.value.trim();
  if (!texto) {
    return;
  }

  if (texto.length > MAX_CARACTERES) {
    agregarBurbuja(`El mensaje no puede superar los ${MAX_CARACTERES} caracteres.`, "error");
    return;
  }

  agregarBurbuja(texto, "usuario");
  campoMensaje.value = "";
  actualizarContador();

  enviarMensaje(texto);
}

/**
 * Actualiza el indicador visual de caracteres restantes.
 */
function actualizarContador() {
  const largo = campoMensaje.value.length;
  contadorCaracteres.textContent = `${largo} / ${MAX_CARACTERES}`;
}

// Eventos de interfaz
zonaDeEscritura.addEventListener("submit", manejarEnvio);
campoMensaje.addEventListener("input", actualizarContador);

// Permitir enviar presionando Enter (sin Shift)
campoMensaje.addEventListener("keydown", (evento) => {
  if (evento.key === "Enter" && !evento.shiftKey) {
    evento.preventDefault();
    zonaDeEscritura.requestSubmit();
  }
});
