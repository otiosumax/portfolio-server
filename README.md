# portfolio-server

Минимальный REST API для проектов портфолио: список проектов, создание,
частичное обновление, удаление и live-обновления через SSE. Без базы данных —
всё хранится в одном JSON-файле.

Стек: Node.js + Express 5 + TypeScript (запускается напрямую, без сборки).

## Возможности

- CRUD по проектам: `GET`, `PUT`, `DELETE`.
- Частичное обновление: присылать нужно только изменяемые поля.
- Server-Sent Events: `GET /events` рассылает `project-created`,
  `project-updated`, `project-deleted`.
- CORS открыт для всех источников — API можно дёргать прямо из браузера.
- Атомарная запись на диск: сначала `data.json.tmp`, потом `rename`.
- Ответы об ошибках всегда в виде JSON.

## Требования

- Node.js 22.18+ (проверено на v24.14.0). Нужна нативная поддержка TypeScript,
  поскольку `npm run dev` запускает `src/server.ts` напрямую; отдельной сборки
  в проекте нет.
- npm.

`process.loadEnvFile()` из Node 20.12+ тоже используется, но перекрывается
требованием выше.

## Установка и запуск

```sh
npm install
cp .env.example .env   # если файла .env ещё нет — см. раздел про переменные
npm run dev
```

Сервер напишет в консоль адрес и путь к файлу данных:

```
Сервер: http://localhost:3000  (данные: ./data.json)
```

## Переменные окружения

Читаются из `.env` в корне проекта (файл в `.gitignore`). **Файл обязателен:**
`process.loadEnvFile(".env")` бросает исключение, если его нет, и сервер не
стартует.

| Переменная  | По умолчанию   | Описание                                          |
| ----------- | -------------- | ------------------------------------------------- |
| `PORT`      | `3000`         | Порт HTTP-сервера                                 |
| `DATA_FILE` | `./data.json`  | Путь к JSON-файлу с массивом проектов             |

Пример `.env`:

```
PORT=3000
DATA_FILE=./data.json
```

Уже существующие переменные окружения имеют приоритет над `.env`: значение из
`PORT=4000 npm run dev` перекроет файл.

## Хранилище

- Источник истины в рантайме — массив в памяти; диск нужен только для
  сохранения между запусками.
- `data.json` создаётся автоматически с содержимым `[]`, если его нет.
- Запись идёт через `data.json.tmp` + `rename`, поэтому файл не бывает
  повреждён наполовину.
- Если `data.json` не парсится, сервер стартует с **пустым** списком (ошибка
  проглатывается) и перезапишет файл при первой же записи.

## API

Все ответы — JSON с `Content-Type: application/json; charset=utf-8`.

| Метод    | Путь            | Описание                          | Успех |
| -------- | --------------- | --------------------------------- | ----- |
| `GET`    | `/projects`     | Список всех проектов              | 200   |
| `GET`    | `/projects/:id` | Один проект                       | 200   |
| `PUT`    | `/projects`     | Создать проект                    | 201   |
| `PUT`    | `/projects/:id` | Обновить проект (можно частично)  | 200   |
| `DELETE` | `/projects/:id` | Удалить проект                    | 204   |
| `GET`    | `/events`       | SSE-поток изменений               | 200   |

### `GET /projects`

```sh
curl http://localhost:3000/projects
```

```json
[
  {
    "id": "a1b2c3d4e5f60718",
    "title": "Smart Home",
    "tags": ["esp32", "iot", "platformio"],
    "description": "Умный дом на ESP32. Датчики + MQTT.",
    "githubLink": "https://github.com/me/smart-home",
    "imageURL": "https://example.com/preview.png"
  }
]
```

### `GET /projects/:id`

```sh
curl http://localhost:3000/projects/a1b2c3d4e5f60718
```

Возвращает проект или `404`.

### `PUT /projects` — создание

Обязательно только `title`. `id` можно не передавать — тогда сервер сгенерирует
случайный 16-символьный hex. Остальные поля по умолчанию пустые (`""` и `[]`).
Ответ — `201` с полным объектом проекта.

```sh
curl --request PUT \
  --url http://localhost:3000/projects \
  --header 'Content-Type: application/json' \
  --data '{
  "id": "a1b2c3d4e5f60718",
  "title": "Smart Home",
  "tags": ["esp32", "iot", "platformio"],
  "description": "Умный дом на ESP32. Датчики + MQTT.",
  "githubLink": "https://github.com/me/smart-home",
  "imageURL": "https://example.com/preview.png"
}'
```

Если `id` уже занят — `409`. Если `id` содержит не только `[A-Za-z0-9]` — `400`.

### `PUT /projects/:id` — обновление

`id` берётся из URL и изменить его через тело нельзя. Отсутствующие в теле поля
сохраняют прежние значения; `tags` заменяется целиком, а не дополняется.

```sh
curl --request PUT \
  --url http://localhost:3000/projects/a1b2c3d4e5f60718 \
  --header 'Content-Type: application/json' \
  --data '{ "title": "Super Smart Home", "tags": ["esp32", "iot"] }'
```

### `DELETE /projects/:id`

```sh
curl --request DELETE http://localhost:3000/projects/a1b2c3d4e5f60718
```

Отвечает `204` без тела. Удаление несуществующего проекта — `404`.

### `GET /events` — SSE

```sh
curl -N http://localhost:3000/events
```

При подключении сервер сразу отправляет комментарий `: connected`, дальше —
события по каждой мутации:

```
event: project-created
data: {"id":"a1b2c3d4e5f60718","title":"Smart Home","tags":[],"description":"","githubLink":"","imageURL":""}

event: project-updated
data: {"id":"a1b2c3d4e5f60718","title":"Super Smart Home","tags":[],"description":"","githubLink":"","imageURL":""}

event: project-deleted
data: {"id":"a1b2c3d4e5f60718"}
```

Из браузера:

```js
const es = new EventSource("http://localhost:3000/events");

es.addEventListener("project-created", (e) => {
  console.log(JSON.parse(e.data));
});
```

События приходят только тем, кто уже подключён: история не хранится, поэтому
после подключения (и после обрыва) список стоит перезапросить через
`GET /projects`.

## Модель проекта

```ts
type Project = {
  id: string;
  title: string;
  tags: string[];
  description: string;
  githubLink: string;
  imageURL: string;
};
```

## Правила валидации

- Тело запроса должно быть JSON-**объектом**; массив, строка или отсутствие тела
  → `400`. Требуется заголовок `Content-Type: application/json`, иначе тело не
  разбирается и ответ тоже будет `400`.
- Тело больше 16 КБ → `413`.
- Тело, не являющееся валидным JSON, → `400` с пояснением от парсера, например:
  `{"error":"Невалидный JSON: Expected double-quoted property name in JSON at position 163 (line 10 column 1)"}`.
- `title` обязателен при создании.
- `title`, `description`, `githubLink`, `imageURL` — строки произвольного UTF-8
  (кириллица в том числе).
- `tags` — массив строк.
- Неизвестные поля в теле игнорируются.
- `id` — только `[A-Za-z0-9]`, уникален.

## Ошибки и статусы

| Статус | Когда возникает                                                        |
| ------ | ---------------------------------------------------------------------- |
| `400`  | Невалидное тело, невалидный JSON, недопустимый `id`, нет `title`        |
| `404`  | Проект или путь не найден                                              |
| `405`  | Метод не поддерживается (в заголовке `Allow` — список разрешённых)      |
| `409`  | `id` уже занят при создании                                            |
| `413`  | Тело больше 16 КБ                                                      |
| `500`  | Внутренняя ошибка; детали пишутся в консоль сервера                     |

Формат любой ошибки:

```json
{ "error": "Проект не найден" }
```

## CORS

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, PUT, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`
- `OPTIONS`-preflight отвечает `204`.

## Частые грабли

- **Висячая запятая в JSON.** JSON, в отличие от JS-объектов, её не допускает.
  Сообщение парсера указывает на строку, где он ждал имя свойства, — обычно это
  закрывающая `}` сразу после лишней запятой.
- **`id` в query-строке не работает.** `PUT /projects?id=...` — это всё равно
  *создание* (и оно создаст второй проект с новым id). Для обновления `id`
  ставится в путь: `/projects/:id`.
- **Забытый `Content-Type: application/json`** приводит к `400`, даже если тело
  корректное.
- **Тело в файле надёжнее inline-строки в шелле:**

  ```sh
  jq . body.json                      # проверка синтаксиса и форматирование
  curl --json @body.json http://localhost:3000/projects
  ```

## Разработка

```sh
npm run dev            # запуск: node src/server.ts
npx tsc --noEmit       # проверка типов
```

Структура проекта:

```
src/
  server.ts      # всё приложение: маршруты, валидация, запись в файл, SSE
  interfaces.ts  # глобальные типы Project и ProjectFields
data.json        # данные (создаётся сам, в .gitignore)
```

## Ограничения

- Тесты пока не написаны: `npm test` — заглушка.
- Аутентификации нет, API открыт всем, кто дотянется до порта.
- Один процесс: состояние живёт в памяти, поэтому несколько инстансов на одном
  файле `data.json` будут затирать друг друга.
- Пагинации, поиска и сортировки нет — `GET /projects` всегда отдаёт всё.
- SSE не переподключается автоматически и не отдаёт пропущенные события;
  переподключение и повторную загрузку списка делает клиент.
