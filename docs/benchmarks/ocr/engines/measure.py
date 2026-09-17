"""Medición reproducible de motores OCR con corpus sintético y real.

La medición conserva el protocolo del notebook original. Cada ejecución debe
recibir explícitamente un directorio nuevo para evitar sobrescribir resultados.
"""

from __future__ import annotations

import argparse
import os
import sys

sys.dont_write_bytecode = True
from pathlib import Path

YELLOW = "\033[33m"


CYAN = "\033[36m"


GREEN = "\033[32m"


RED = "\033[31m"


RESET = "\033[0m"


def info(text: str, highlight: object = "", after: str = "") -> None:
    """Resalta un dato y devuelve el resto del mensaje al cian."""
    message = text.rstrip(". ")
    if highlight != "":
        message += f" {GREEN}{highlight}{CYAN}"
    if after:
        message += f" {after.rstrip('. ')}"
    print(f"{YELLOW}[*]{RESET} {CYAN}{message}.{RESET}")


def error(text: str) -> None:
    print(f"{RED}[!] ERROR: {text.rstrip('. ')}.{RESET}")


def add_run_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--run",
        action="store_true",
        required=True,
        help="Confirma que se desea ejecutar la medición, que puede tardar horas.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        required=True,
        metavar="DIR",
        help="Directorio nuevo donde se guardará el JSON de resultados.",
    )


def prepare_output_dir(output_dir: Path, script_path: Path) -> Path:
    """Crea una carpeta nueva fuera de los resultados conservados."""
    benchmarks_root = script_path.resolve().parents[2]
    target = output_dir.expanduser().resolve()
    if target.is_relative_to(benchmarks_root):
        raise ValueError(f"--output-dir no puede estar dentro de {benchmarks_root}")

    if target.exists():
        raise FileExistsError(f"el directorio de salida ya existe: {target}")
    target.mkdir(parents=True)
    os.chdir(target)
    return target


def parse_and_prepare(
    description: str,
    script_path: Path,
    argv: list[str] | None = None,
) -> tuple[argparse.Namespace, Path]:
    parser = argparse.ArgumentParser(description=description)
    add_run_arguments(parser)
    args = parser.parse_args(argv)
    try:
        output_dir = prepare_output_dir(args.output_dir, script_path)
    except (FileExistsError, OSError, ValueError) as exc:
        parser.error(str(exc))
    return args, output_dir

if __name__ == "__main__":
    _ARGS, _OUTPUT_DIR = parse_and_prepare(
        "Mide los motores OCR del corpus de Manualito.", Path(__file__)
    )

import contextlib
import gc
import io
import json
import os
import re
import statistics
import sys
import time
import unicodedata
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

# ── Formato de salida con colores ANSI ──────────────────────────────────
_ESC = chr(27)
_Y = f"{_ESC}[33m"
_C = f"{_ESC}[36m"
_R = f"{_ESC}[31m"
_0 = f"{_ESC}[0m"


@contextlib.contextmanager
def silenciar():
    """Suprime stdout/stderr (Python y C/C++) durante el bloque.

    PaddleOCR/PaddleX imprime mensajes "Creating model..." y "Model files already exist..."
    por cada modelo cargado, además de avisos en C++ que escapan a redirect_stdout. Este
    context manager los silencia a nivel de descriptor de fichero (fd 1 y fd 2).
    """
    sys.stdout.flush()
    sys.stderr.flush()
    devnull_fd = os.open(os.devnull, os.O_WRONLY)
    saved_out = os.dup(1)
    saved_err = os.dup(2)
    py_out, py_err = sys.stdout, sys.stderr
    sys.stdout = io.StringIO()
    sys.stderr = io.StringIO()
    try:
        os.dup2(devnull_fd, 1)
        os.dup2(devnull_fd, 2)
        yield
    finally:
        sys.stdout.flush()
        sys.stderr.flush()
        os.dup2(saved_out, 1)
        os.dup2(saved_err, 2)
        os.close(devnull_fd)
        os.close(saved_out)
        os.close(saved_err)
        sys.stdout = py_out
        sys.stderr = py_err


# ── Rutas y configuración ─────────────────────────────────────────────
BENCHMARK_DIR = Path(".")
DATASET_DIR = Path(__file__).resolve().parent / "dataset"
TEMP_DIR = BENCHMARK_DIR / "_tmp_synth"
N_REPETICIONES = 3

# ── 4 configuraciones de OCR ────────────────────────────────────────────
# Paleta Catppuccin Mocha, un color por motor para gráficas.
MOTORES = [
    {
        "id": "paddleocr_cpu",
        "nombre": "PaddleOCR CPU",
        "etiqueta": "PaddleOCR\nCPU",
        "descripcion": "Baidu PP-OCRv5, device=cpu, lang=es",
        "color": "#89b4fa",
    },
    {
        "id": "paddleocr_gpu",
        "nombre": "PaddleOCR GPU",
        "etiqueta": "PaddleOCR\nGPU",
        "descripcion": "Baidu PP-OCRv5, device=gpu, lang=es",
        "color": "#74c7ec",
    },
    {
        "id": "tesseract",
        "nombre": "Tesseract",
        "etiqueta": "Tesseract",
        "descripcion": "Google/HP Tesseract v4+ LSTM, lang=spa",
        "color": "#fab387",
    },
    {
        "id": "easyocr",
        "nombre": "EasyOCR",
        "etiqueta": "EasyOCR",
        "descripcion": "JaidedAI CRAFT+CRNN, lang=es",
        "color": "#a6e3a1",
    },
]

info("Configuración lista:", f"{len(MOTORES)} motores, {N_REPETICIONES} repeticiones/imagen")


# ── Distancia de Levenshtein ────────────────────────────────────────────
def levenshtein(s: str, t: str) -> int:
    n, m = len(s), len(t)
    if n == 0:
        return m
    if m == 0:
        return n
    prev = list(range(m + 1))
    for i in range(1, n + 1):
        curr = [i] + [0] * m
        for j in range(1, m + 1):
            cost = 0 if s[i - 1] == t[j - 1] else 1
            curr[j] = min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
        prev = curr
    return prev[m]


def levenshtein_words(s: list[str], t: list[str]) -> int:
    n, m = len(s), len(t)
    if n == 0:
        return m
    if m == 0:
        return n
    prev = list(range(m + 1))
    for i in range(1, n + 1):
        curr = [i] + [0] * m
        for j in range(1, m + 1):
            cost = 0 if s[i - 1] == t[j - 1] else 1
            curr[j] = min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
        prev = curr
    return prev[m]


def normalizar_texto(texto: str) -> str:
    return " ".join(texto.split()).strip().lower()


def cer(prediccion: str, ground_truth: str) -> float:
    pred = normalizar_texto(prediccion)
    gt = normalizar_texto(ground_truth)
    if not gt:
        return 0.0 if not pred else 1.0
    return min(levenshtein(pred, gt) / len(gt), 1.0)


def wer(prediccion: str, ground_truth: str) -> float:
    pred_words = normalizar_texto(prediccion).split()
    gt_words = normalizar_texto(ground_truth).split()
    if not gt_words:
        return 0.0 if not pred_words else 1.0
    return min(levenshtein_words(pred_words, gt_words) / len(gt_words), 1.0)


# ── Generación de imágenes sintéticas ───────────────────────────────────
def _cargar_fuente(size: int):
    for path in [
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]:
        try:
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def generar_imagen(texto: str, categoria: str, ancho: int = 800, alto: int = 200):
    if categoria == "parrafo":
        alto = 400

    bg = (255, 255, 255)
    fg = (0, 0, 0)
    font_size = 28

    if categoria == "fuente_pequena":
        font_size = 14
    elif categoria == "bajo_contraste":
        bg = (200, 200, 200)
        fg = (140, 140, 140)

    font = _cargar_fuente(font_size)
    img = Image.new("RGB", (ancho, alto), bg)
    draw = ImageDraw.Draw(img)

    if categoria == "parrafo":
        palabras = texto.split()
        lineas, linea_actual = [], ""
        for palabra in palabras:
            test = f"{linea_actual} {palabra}".strip()
            bbox = draw.textbbox((0, 0), test, font=font)
            if bbox[2] > ancho - 40:
                lineas.append(linea_actual)
                linea_actual = palabra
            else:
                linea_actual = test
        if linea_actual:
            lineas.append(linea_actual)
        y = 20
        for linea in lineas:
            draw.text((20, y), linea, fill=fg, font=font)
            y += font_size + 8
    else:
        draw.text((20, alto // 2 - font_size), texto, fill=fg, font=font)

    if categoria == "ruido":
        arr = np.array(img)
        rng = np.random.default_rng(42)
        mask = rng.random(arr.shape[:2]) < 0.05
        salt = mask & (rng.random(arr.shape[:2]) < 0.5)
        pepper = mask & ~salt
        arr[salt] = 255
        arr[pepper] = 0
        img = Image.fromarray(arr)

    return img


# ── Detección de soporte GPU en PaddlePaddle ────────────────────────────
def _paddle_gpu_disponible() -> bool:
    """True solo si paddlepaddle se compiló con CUDA y hay >=1 GPU NVIDIA."""
    try:
        with silenciar():
            import paddle

            return bool(paddle.is_compiled_with_cuda() and paddle.device.cuda.device_count() > 0)
    except Exception:
        return False


# ── Extracción de texto por motor ───────────────────────────────────────
def extraer_texto(motor, motor_id: str, img_path: str) -> dict:
    if motor_id.startswith("paddleocr"):
        with silenciar():
            result = motor.predict(img_path)
        textos, scores = [], []
        for res in result:
            if "rec_texts" not in res or "rec_scores" not in res:
                continue
            for text, score in zip(res["rec_texts"], res["rec_scores"]):
                textos.append(text)
                scores.append(float(score))
        return {
            "texto": " ".join(textos),
            "confianza": round(statistics.mean(scores), 4) if scores else None,
        }

    if motor_id == "tesseract":
        import pytesseract
        from pytesseract import Output

        texto = pytesseract.image_to_string(img_path, lang="spa")
        data = pytesseract.image_to_data(img_path, lang="spa", output_type=Output.DICT)
        confs = [int(c) for c in data["conf"] if int(c) > 0]
        return {
            "texto": texto.strip(),
            "confianza": round(statistics.mean(confs) / 100, 4) if confs else None,
        }

    if motor_id == "easyocr":
        with silenciar():
            resultados = motor.readtext(img_path)
        textos = [r[1] for r in resultados]
        scores = [float(r[2]) for r in resultados]
        return {
            "texto": " ".join(textos),
            "confianza": round(statistics.mean(scores), 4) if scores else None,
        }

    return {"texto": "", "confianza": None}


# ── Inicialización de motores ───────────────────────────────────────────
def crear_motor(motor_id: str):
    try:
        if motor_id == "paddleocr_cpu":
            with silenciar():
                from paddleocr import PaddleOCR

                return PaddleOCR(
                    use_textline_orientation=True, lang="es", enable_mkldnn=False, device="cpu"
                )
        if motor_id == "paddleocr_gpu":
            if not _paddle_gpu_disponible():
                raise RuntimeError(
                    "paddlepaddle no tiene soporte CUDA "
                    "(instalar paddlepaddle-gpu para habilitar GPU)"
                )
            with silenciar():
                from paddleocr import PaddleOCR

                return PaddleOCR(use_textline_orientation=True, lang="es", device="gpu")
        if motor_id == "tesseract":
            import pytesseract

            pytesseract.get_tesseract_version()
            return pytesseract
        if motor_id == "easyocr":
            with silenciar():
                import easyocr

                return easyocr.Reader(["es"], gpu=False, verbose=False)
    except Exception as err:
        error(f"No se pudo inicializar {motor_id}: {err}")
        return None
    return None


info("Funciones auxiliares definidas.")

# ── Textos ground truth en español ──────────────────────────────────────
IMAGENES_SINTETICAS = [
    {
        "id": "limpio",
        "categoria": "limpio",
        "nombre": "Texto limpio",
        "texto_gt": "En Catan el objetivo es ser el primer jugador en alcanzar diez puntos de victoria.",
    },
    {
        "id": "fuente_pequena",
        "categoria": "fuente_pequena",
        "nombre": "Fuente pequeña",
        "texto_gt": "Los recursos disponibles son madera, arcilla, lana, trigo y mineral.",
    },
    {
        "id": "parrafo",
        "categoria": "parrafo",
        "nombre": "Párrafo multilínea",
        "texto_gt": (
            "Para construir un poblado necesitas una madera, una arcilla, una lana y un trigo. "
            "Para construir una ciudad necesitas dos trigos y tres minerales. "
            "Las carreteras cuestan una madera y una arcilla cada una."
        ),
    },
    {
        "id": "ruido",
        "categoria": "ruido",
        "nombre": "Ruido sal-pimienta",
        "texto_gt": "El ladrón se activa cuando alguien saca un siete con los dados.",
    },
    {
        "id": "bajo_contraste",
        "categoria": "bajo_contraste",
        "nombre": "Bajo contraste",
        "texto_gt": "Los puertos permiten cambiar recursos a una tasa favorable.",
    },
    {
        "id": "especiales",
        "categoria": "especiales",
        "nombre": "Caracteres especiales",
        "texto_gt": "¡El niño preguntó: ¿por qué no había más información sobre la muñeca española?",
    },
]


if __name__ == "__main__":
    import contextlib
    import gc
    import io
    import json
    import os
    import re
    import statistics
    import time
    import unicodedata
    import warnings

    import numpy as np
    from PIL import Image, ImageDraw, ImageFont

    TEMP_DIR.mkdir(exist_ok=True)
    for img_def in IMAGENES_SINTETICAS:
        img = generar_imagen(img_def["texto_gt"], img_def["categoria"])
        path = TEMP_DIR / f"{img_def['id']}.png"
        img.save(str(path))
        img_def["img_path"] = str(path)
    info("Imágenes sintéticas generadas:", f"{len(IMAGENES_SINTETICAS)} imágenes en {TEMP_DIR}")

    resultados_detalle: dict[str, list[dict]] = {}
    resumen: list[dict] = []
    motores_activos: list[dict] = []
    for cfg in MOTORES:
        info(cfg["nombre"], cfg["descripcion"])
        motor = crear_motor(cfg["id"])
        if motor is None:
            info("Motor no disponible, saltando:", cfg["nombre"])
            continue
        motores_activos.append(cfg)
        try:
            extraer_texto(motor, cfg["id"], IMAGENES_SINTETICAS[0]["img_path"])
            info("Warm-up completado:", cfg["nombre"])
        except Exception as err:
            error(f"Fallo en warm-up de {cfg['nombre']}: {err}")
            continue
        detalles: list[dict] = []
        for img_def in IMAGENES_SINTETICAS:
            tiempos, cers, wers, confs = [], [], [], []
            ultimo_texto = ""
            for run in range(N_REPETICIONES):
                t0 = time.perf_counter()
                try:
                    res = extraer_texto(motor, cfg["id"], img_def["img_path"])
                except Exception as err:
                    error(f"{img_def['id']} run {run}: {err}")
                    continue
                t1 = time.perf_counter()
                cers.append(cer(res["texto"], img_def["texto_gt"]))
                wers.append(wer(res["texto"], img_def["texto_gt"]))
                tiempos.append(t1 - t0)
                ultimo_texto = res["texto"]
                if res["confianza"] is not None:
                    confs.append(res["confianza"])
            if tiempos:
                detalle = {
                    "imagen_id": img_def["id"],
                    "imagen_nombre": img_def["nombre"],
                    "texto_pred": ultimo_texto[:200],
                    "cer": round(statistics.mean(cers), 4),
                    "wer": round(statistics.mean(wers), 4),
                    "tiempo_s": round(statistics.mean(tiempos), 4),
                    "confianza": round(statistics.mean(confs), 4) if confs else None,
                }
                detalles.append(detalle)
                info(
                    img_def["nombre"],
                    f"CER={detalle['cer']:.3f} WER={detalle['wer']:.3f} t={detalle['tiempo_s']:.2f}s",
                )
        resultados_detalle[cfg["nombre"]] = detalles
        if detalles:
            confs_validas = [d["confianza"] for d in detalles if d["confianza"] is not None]
            resumen.append(
                {
                    "nombre": cfg["nombre"],
                    "etiqueta": cfg["etiqueta"],
                    "color": cfg["color"],
                    "cer_medio": round(statistics.mean(d["cer"] for d in detalles), 4),
                    "wer_medio": round(statistics.mean(d["wer"] for d in detalles), 4),
                    "precision": round(1 - statistics.mean(d["cer"] for d in detalles), 4),
                    "velocidad_s": round(statistics.mean(d["tiempo_s"] for d in detalles), 4),
                    "confianza_media": round(statistics.mean(confs_validas), 4)
                    if confs_validas
                    else None,
                }
            )
        del motor
        gc.collect()

    resultados_reales_detalle: dict[str, list[dict]] = {}
    GROUND_TRUTH_DIR = DATASET_DIR / "ground_truth"
    IMAGENES_REALES = [
        {"id": "test1", "nombre": "Periódico Granma", "archivo": "test1.jpg"},
        {"id": "test2", "nombre": "Manual Merck Veterinaria", "archivo": "test2.jpg"},
        {"id": "test3", "nombre": "Diario de Burgos (1928)", "archivo": "test3.jpg"},
    ]
    UMBRAL_FRAGMENTO_DETECTADO_WER = 0.35
    resumen_real: list[dict] = []
    motores_reales_activos: list[dict] = []

    def normalizar_texto_real(texto: str) -> str:
        texto = unicodedata.normalize("NFKD", texto)
        texto = "".join(c for c in texto if not unicodedata.combining(c))
        texto = texto.lower()
        texto = re.sub(r"[^a-z0-9]+", " ", texto)
        return " ".join(texto.split()).strip()

    def cer_real(prediccion: str, ground_truth: str) -> float:
        pred = normalizar_texto_real(prediccion)
        gt = normalizar_texto_real(ground_truth)
        if not gt:
            return 0.0 if not pred else 1.0
        return min(levenshtein(pred, gt) / len(gt), 1.0)

    def wer_real(prediccion: str, ground_truth: str) -> float:
        pred_words = normalizar_texto_real(prediccion).split()
        gt_words = normalizar_texto_real(ground_truth).split()
        if not gt_words:
            return 0.0 if not pred_words else 1.0
        return min(levenshtein_words(pred_words, gt_words) / len(gt_words), 1.0)

    def cargar_fragmentos_gt(imagen_id: str) -> list[str]:
        path = GROUND_TRUTH_DIR / f"{imagen_id}.txt"
        if not path.exists():
            error(f"Ground truth no encontrado: {path}")
            return []
        return [
            line.strip()
            for line in path.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        ]

    def mejor_match_fragmento(prediccion: str, fragmento_gt: str) -> dict:
        pred_words = normalizar_texto_real(prediccion).split()
        gt_words = normalizar_texto_real(fragmento_gt).split()
        if not gt_words:
            return {"cer": 0.0, "wer": 0.0, "texto_match": ""}
        if not pred_words:
            return {"cer": 1.0, "wer": 1.0, "texto_match": ""}
        min_len = max(1, len(gt_words) - 3)
        max_len = min(len(pred_words), len(gt_words) + 3)
        mejor = {"cer": 1.0, "wer": 1.0, "texto_match": ""}
        for window_len in range(min_len, max_len + 1):
            for start in range(0, len(pred_words) - window_len + 1):
                candidato = " ".join(pred_words[start : start + window_len])
                w = wer_real(candidato, fragmento_gt)
                c = cer_real(candidato, fragmento_gt)
                if (w, c) < (mejor["wer"], mejor["cer"]):
                    mejor = {"cer": c, "wer": w, "texto_match": candidato}
                    if w == 0.0 and c == 0.0:
                        return mejor
        return mejor

    def evaluar_fragmentos_reales(prediccion: str, fragmentos_gt: list[str]) -> dict:
        if not fragmentos_gt:
            return {
                "cer_medio": None,
                "wer_medio": None,
                "precision": None,
                "fragmentos_detectados": None,
                "fragmentos": [],
            }
        fragmentos = []
        for fragmento_gt in fragmentos_gt:
            match = mejor_match_fragmento(prediccion, fragmento_gt)
            fragmentos.append(
                {
                    "fragmento_gt": fragmento_gt,
                    "texto_match": match["texto_match"],
                    "cer": round(match["cer"], 4),
                    "wer": round(match["wer"], 4),
                    "detectado": match["wer"] <= UMBRAL_FRAGMENTO_DETECTADO_WER,
                }
            )
        cer_medio = statistics.mean(f["cer"] for f in fragmentos)
        wer_medio = statistics.mean(f["wer"] for f in fragmentos)
        detectados = sum(1 for f in fragmentos if f["detectado"])
        return {
            "cer_medio": round(cer_medio, 4),
            "wer_medio": round(wer_medio, 4),
            "precision": round(1 - cer_medio, 4),
            "fragmentos_detectados": f"{detectados}/{len(fragmentos)}",
            "fragmentos": fragmentos,
        }

    for cfg in motores_activos:
        sep = "=" * 64
        print(f"\n{sep}")
        info(f"  {cfg['nombre']}")
        info(f"  {cfg['descripcion']}")
        print(sep)

        motor = crear_motor(cfg["id"])
        if motor is None:
            info("Motor no disponible, saltando:", cfg["nombre"])
            continue

        motores_reales_activos.append(cfg)
        detalles_motor: list[dict] = []

        for img_real in IMAGENES_REALES:
            ruta = DATASET_DIR / img_real["archivo"]
            if not ruta.exists():
                error(f"Imagen no encontrada: {ruta}")
                continue

            fragmentos_gt = cargar_fragmentos_gt(img_real["id"])
            t0 = time.perf_counter()
            try:
                res = extraer_texto(motor, cfg["id"], str(ruta))
            except Exception as err:
                error(f"  {img_real['id']}: {err}")
                continue
            t1 = time.perf_counter()

            evaluacion = evaluar_fragmentos_reales(res["texto"], fragmentos_gt)
            detalle = {
                "imagen_id": img_real["id"],
                "imagen_nombre": img_real["nombre"],
                "archivo": img_real["archivo"],
                "prediccion": res["texto"],
                "fragmentos_gt": len(fragmentos_gt),
                "tiempo_s": round(t1 - t0, 4),
                "confianza": res["confianza"],
                **evaluacion,
            }
            detalles_motor.append(detalle)

            if detalle["precision"] is None:
                info(
                    f"  {img_real['nombre']:25s}", f"sin ground truth  t={detalle['tiempo_s']:.2f}s"
                )
            else:
                info(
                    f"  {img_real['nombre']:25s}",
                    f"Prec={detalle['precision']:.2%}  WER={detalle['wer_medio']:.3f}  "
                    f"frag={detalle['fragmentos_detectados']}  t={detalle['tiempo_s']:.2f}s",
                )

        resultados_reales_detalle[cfg["nombre"]] = detalles_motor

        evaluadas = [d for d in detalles_motor if d["precision"] is not None]
        if evaluadas:
            confs_validas = [d["confianza"] for d in evaluadas if d["confianza"] is not None]
            resumen_real.append(
                {
                    "nombre": cfg["nombre"],
                    "etiqueta": cfg["etiqueta"],
                    "color": cfg["color"],
                    "imagenes_evaluadas": len(evaluadas),
                    "cer_medio": round(statistics.mean(d["cer_medio"] for d in evaluadas), 4),
                    "wer_medio": round(statistics.mean(d["wer_medio"] for d in evaluadas), 4),
                    "precision": round(statistics.mean(d["precision"] for d in evaluadas), 4),
                    "velocidad_s": round(statistics.mean(d["tiempo_s"] for d in evaluadas), 4),
                    "confianza_media": (
                        round(statistics.mean(confs_validas), 4) if confs_validas else None
                    ),
                }
            )

        del motor
        gc.collect()

    output = {
        "fecha": time.strftime("%Y-%m-%d"),
        "n_repeticiones": N_REPETICIONES,
        "motores": [cfg["nombre"] for cfg in motores_activos],
        "imagenes_sinteticas": [
            {"id": d["id"], "categoria": d["categoria"], "texto_gt": d["texto_gt"]}
            for d in IMAGENES_SINTETICAS
        ],
        "detalle": resultados_detalle,
        "resumen": resumen,
        "imagenes_reales": IMAGENES_REALES,
        "detalle_real": resultados_reales_detalle,
        "resumen_real": resumen_real,
    }
    Path("results.json").write_text(
        json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    info(
        "Benchmark completado:",
        f"{len(resumen)} motores sintéticos y {len(resumen_real)} reales",
    )
    info("Resultados guardados en:", "results.json")
