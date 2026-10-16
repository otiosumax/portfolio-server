import fs from "fs";

// подгрузка переменных окружения
process.loadEnvFile(".env");
const PORT = process.env.PORT ?? 3000;
const DATA_FILE = process.env.DATA_FILE ?? "./data.json";

/**
 * чтение сохраненных в data.json проектов
 */
function load(): Project[] {
  const data = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(data);
}

let projects = load();

/**
 * запись списка проектов в докУмент
 */
function commit(next: Project[]): void {
  fs.writeFileSync(DATA_FILE + ".tmp", JSON.stringify(next, null));
  fs.renameSync(DATA_FILE + ".tmp", DATA_FILE);
}
