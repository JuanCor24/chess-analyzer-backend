import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { Chess } from "chess.js";

const modelos = ["gemini-2.5-flash", "gemini-1.5-pro"];

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const mapTipo = {
  n: "knight",
  b: "bishop",
  p: "pawn",
  r: "rook",
  q: "queen",
  k: "king",
  N: "knight",
  B: "bishop",
  P: "pawn",
  R: "rook",
  Q: "queen",
  K: "king",
};

const mapColor = {
  b: "black",
  w: "white",
};

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("No se encontró GEMINI_API_KEY en .env");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

function analizarFEN(fen) {
  const chess = new Chess();
  chess.load(fen);

  const ataques = {};
  const defensas = {};
  const legales = chess.moves({ verbose: true });
  const board = chess.board();
  const files = "abcdefgh";

  function coordToSquare(row, col) {
    return files[col] + (8 - row);
  }

  function dentroTablero(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
  }

  function movimientosAtaque(piece, row, col) {
    const pataleando = [];
    const color = piece.color;

    const direcciones = {
      p:
        color === "w"
          ? [
              [-1, -1],
              [-1, 1],
            ]
          : [
              [1, -1],
              [1, 1],
            ],
      n: [
        [-2, -1],
        [-2, 1],
        [-1, -2],
        [-1, 2],
        [1, -2],
        [1, 2],
        [2, -1],
        [2, 1],
      ],
      b: [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ],
      r: [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ],
      q: [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ],
      k: [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ],
    };

    const maxPasos = { p: 1, n: 1, b: 7, r: 7, q: 7, k: 1 }[piece.type];

    const dirs = direcciones[piece.type];
    for (const [dr, dc] of dirs) {
      for (let step = 1; step <= maxPasos; step++) {
        const r = row + dr * step;
        const c = col + dc * step;
        if (!dentroTablero(r, c)) break;

        const target = board[r][c];
        pataleando.push([r, c]);

        if (target) break;
      }
    }

    return pataleando;
  }

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (!piece) continue;

      const square = coordToSquare(row, col);

      // ATAQUES
      const posiblesAtaques = movimientosAtaque(piece, row, col);
      for (const [r, c] of posiblesAtaques) {
        const target = board[r][c];

        if (target && target.color !== piece.color) {
          const desde = square;
          const hasta = coordToSquare(r, c);

          if (!ataques[desde]) ataques[desde] = [];
          ataques[desde].push({
            desde,
            hasta,
            pieza_atacada: mapTipo[target.type] || target.type,
            color_pieza_que_ataca: mapColor[piece.color] || piece.color,
            color_pieza_atacada: mapColor[target.color] || piece.color,
            tipo_de_pieza_que_ataca: mapTipo[piece.type] || target.type,
          });
        }
      }

      // DEFENSAS
      const posibles = movimientosAtaque(piece, row, col);
      posibles.forEach(([r, c]) => {
        const target = board[r][c];
        if (target && target.color === piece.color) {
          const destino = coordToSquare(r, c);
          if (!defensas[square]) defensas[square] = [];
          defensas[square].push({
            desde: square,
            defiende: destino,
            pieza_que_defiende: mapTipo[piece.type] || target.type,
            pieza_defendida: mapTipo[target.type] || target.type,
            colorpiezas: mapColor[target.color] || target.color,
          });
        }
      });
    }
  }

  const mensaje = `
ATAQUES REALES:
${JSON.stringify(ataques, null, 2)}

DEFENSAS REALES:
${JSON.stringify(defensas, null, 2)}

JUGADAS LEGALES EN ESTA POSICIÓN:
${legales.map((m) => m.san).join(", ")}
`;

  return { ataques, defensas, legales };
}

// Uso en tu POST
app.post("/evaluar", async (req, res) => {
  try {
    const { posicion, jugada, evaluacion, historial, mejorJugada } = req.body;

    console.log("📥 Datos recibidos del front-end:");
    console.log("Posición FEN:", posicion);
    console.log("Jugada:", jugada);
    console.log("Evaluación Stockfish:", evaluacion);
    console.log("Historial de jugadas:", historial);
    console.log("Mejor jugada:", mejorJugada);

    const color = historial.length % 2 === 0 ? "blanco" : "negro";
    const color2 = historial.length % 2 !== 0 ? "blanco" : "negro";
    console.log("Turno del", color);
    console.log("Acaba de jugar el", color2);
    const { ataques, defensas, legales } = analizarFEN(posicion);

    console.log(`Culito fino:  ${JSON.stringify(ataques, null, 2)}`, ataques);

    console.log(`Culito fino:  ${JSON.stringify(defensas, null, 2)}`, defensas);

    const prompt = `Analiza la posición en FEN: ${posicion}
Turno: ${color}
Historial: ${historial}
Evaluación Stockfish: ${evaluacion}
Y la mejor jugada del ${color} es: ${mejorJugada}


Ataques para el ${color} :
${JSON.stringify(ataques, null, 2)}

DEFENSAS:
${JSON.stringify(defensas, null, 2)}

JUGADAS LEGALES:
${legales.map((m) => m.san).join(", ")}


REGLAS IMPORTANTES (CÚMPLELAS ESTRICTAMENTE):
0. No pongas ningun tipo de ataque que no te haya pasado anteriormente o defensa de la jugada anterior
1. SOLO describes piezas y casillas que realmente existan en el FEN.
2. NO inventes piezas, NO inventes capturas posibles que no existan, 
   NO inventes amenazas.
3. Todas las jugadas que propongas deben ser legales 
4. Si mencionas un ataque, amenaza o defensa, Tienes que comprobarlo en los ataques y defensas que te he pasado 
5. NO asumas peones invisibles, NO asumas piezas “en su casilla inicial”, 
   NO asumas jugadas previas más allá del FEN.
6. Si una amenaza NO existe, dilo explícitamente.
7. Todo tu texto debe estar escrito con un formato claro y facil de entender (como el texto de un cuento).

FORMATO DE RESPUESTA:
1. Dependiendo de las jugadas disponibles para el bando que le toca jugar y la ventaja que da la maquina 
¿La ultima jugada hecha es buena, mala o aceptable? 
2. Dame una Explicación de la clasificacion de la ultima jugada basado en los ataques,defensas y jugadas legales 
descritas anteriormente teniendo en cuenta conceptos basicos del ajedrez.
3. Idea estratégica y posibles planes detrás de la posicion actual segun  basado en los ataques,defensas y jugadas legales 
descritas anteriormente.


FORMATO:
1. "Valoración: ..."
2. "Explicación: ..."`;

    console.log("📤 Enviando prompt a Gemini...");
    const texto = await generarAnalisis(prompt);

    console.log("✅ Respuesta recibida de Gemini");
    res.json({ mensaje: texto });
  } catch (error) {
    console.error("❌ Error en la IA:", error);
    res.status(500).json({ error: error.message });
  }
});

async function generarAnalisis(prompt) {
  for (const modelo of modelos) {
    try {
      const response = await ai.models.generateContent({
        model: modelo,
        contents: prompt,
      });
      return response.text;
    } catch (error) {
      if (error.status === 503) {
        console.warn(`Modelo ${modelo} saturado, intentando siguiente...`);
      } else {
        throw error;
      }
    }
  }
  throw new Error("Todos los modelos están saturados, intenta más tarde.");
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
