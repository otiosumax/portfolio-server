import crypto from "crypto";
import express from "express";
import fs from "fs";
import type { Request, Response } from "express";
import type { ServerResponse } from "http";

// подгрузка переменных окружения
process.loadEnvFile(".env");
const PORT = process.env.PORT ?? 3000;
const DATA_FILE = process.env.DATA_FILE ?? "./data.json";
const ID_RE = /^[A-Za-z0-9]+$/;

// РАБота с файлами
/**
 * чтение сохраненных в data.json проектов
 */
function load(): Project[] {
  try {
    if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");
    const data = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

let projects = load();

/**
 * запись списка проектов в докУмент
 */
function commit(next: Project[]): void {
  fs.writeFileSync(DATA_FILE + ".tmp", JSON.stringify(next, null));
  fs.renameSync(DATA_FILE + ".tmp", DATA_FILE);
  projects = next;
}

// ВАЛИДАЦИЯ
/** (де)генерация айди проекта */
function generateId() {
  let id: string;
  do {
    id = crypto.randomBytes(256).toString("hex");
  } while (projects.some((p) => p.id === id));
  return id;
}

const isObject = (v: any) =>
  v !== null && typeof v === "object" && !Array.isArray(v);

function requireBody(req: Request) {
  if (!isObject(req.body))
    throw new Error("404. Тело запроса должно быть JSON-объектом");
  return req.body;
}

function pickFields(body: Record<string, unknown>): ProjectFields {
  const out: ProjectFields = {};

  for (const key of [
    "title",
    "description",
    "githubLink",
    "imageURL",
  ] as const) {
    const value = body[key];
    if (value === undefined) continue;
    if (typeof value !== "string") {
      throw new Error(`400. Поле ${key} должно быть строкой`);
    }
    out[key] = value;
  }

  if (body.tags !== undefined) {
    const tags = body.tags;
    if (!Array.isArray(tags) || !tags.every((t) => typeof t === "string")) {
      throw new Error(`400. Поле tags должно быть массивом строк`);
    }
    out.tags = tags;
  }

  return out;
}
// SSE приколы
const clients = new Set<ServerResponse>();

function broadcast<T>(
  event: "project-created" | "project-updated" | "project-deleted",
  data: T,
) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

// ОБРАБОТЧИКИ
const listProjects = (req: Request, res: Response) => res.json(projects);

function getProject(req: Request, res: Response) {
  const project = projects.find((p) => p.id === req.params.id);
  if (!project) throw new Error(`404. Проект не найден`);
  res.json(project);
}

function createProject(req: Request, res: Response) {
  const body = requireBody(req);
  const fields = pickFields(body);
  if (fields.title === undefined)
    throw new Error(`400. Поле title обязательно`);

  let id = body.id;
  if (id === undefined) {
    id = generateId();
  } else if (typeof id !== "string" || !ID_RE.test(id)) {
    throw new Error(`400. Недопустимый id`);
  }
  if (projects.some((p) => p.id === id)) {
    throw new Error(`409. Проект с таким id уже существует`);
  }

  const project: Project = {
    id,
    title: fields.title,
    tags: fields.tags ?? [],
    description: fields.description ?? "",
    githubLink: fields.githubLink ?? "",
    imageURL: fields.imageURL ?? "",
  };

  commit([...projects, project]);
  broadcast("project-created", project);
  res.status(201).json(project);
}

function updateProject(req: Request, res: Response) {
  const idx = projects.findIndex((p) => p.id === req.params.id);
  const current = projects[idx];
  if (!current) throw new Error("404. Проект не найден");

  const fields = pickFields(requireBody(req));
  const updated: Project = {
    ...current,
    ...fields,
    id: current.id,
  };
  const next = [...projects];
  next[idx] = updated;

  commit(next);
  broadcast("project-updated", updated);
  res.json(updated);
}

function deleteProject(req: Request, res: Response) {
  const idx = projects.findIndex((p) => p.id === req.params.id);
  if (idx === -1) throw new Error("404. Проект не найден");

  commit(projects.filter((_, i) => i !== idx));
  broadcast("project-deleted", { id: req.params.id });
  res.status(204).end();
}

function openEvents(req: Request, res: Response) {
  res.set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();
  res.write(": connected\n\n");
  clients.add(res);
  req.on("close", () => clients.delete(res));
}

const notAllowed = (allow: string) => (req: Request, res: Response) => {
  res.set("Allow", allow);
  res.status(405).json({ error: `Метод ${req.method} не поддерживается` });
};

// ПРИЛОЖЕНИЕ
const app = express();

app.use((req, res, next) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  if (req.method === "OPTIONS") return res.status(204).end(); // preflight
  next();
});

app.param("id", (req, res, next, id) => {
  if (!ID_RE.test(id)) return next(new Error(`400. Недопустимый id`));
  next();
});

app
  .route("/projects")
  .get(listProjects)
  .put(createProject)
  .all(notAllowed("GET, PUT"));

app
  .route("/projects/:id")
  .get(getProject)
  .put(updateProject)
  .delete(deleteProject)
  .all(notAllowed("GET, PUT, DELETE"));

app.route("/events").get(openEvents).all(notAllowed("GET"));

// 5. Ничего не подошло → 404.
app.use((req, res) => {
  res.status(404).json({ error: "Путь не найден" });
});

// 6. Обработчик ошибок (четыре аргумента — так Express его узнаёт).
// app.use((err, req, res, next) => {
//   if (res.headersSent) return next(err);
//   if (err instanceof Error) {
//     return res.status(err.status).json({ error: err.message });
//   }
//   if (err.type === "entity.too.large") {
//     return res.status(413).json({ error: "Тело запроса больше 16 КБ" });
//   }
//   if (err.type === "entity.parse.failed") {
//     return res.status(400).json({ error: "Невалидный JSON" });
//   }
//   if (err.status >= 400 && err.status < 500) {
//     return res.status(400).json({ error: "Невалидный запрос" });
//   }
//   console.error(err);
//   res.status(500).json({ error: "Внутренняя ошибка сервера" });
// });

app.listen(PORT, () => {
  console.log(`Сервер: http://localhost:${PORT}  (данные: ${DATA_FILE})`);
});
