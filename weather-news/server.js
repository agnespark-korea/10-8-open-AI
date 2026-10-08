// 날씨 & 뉴스 대시보드 서버
// - public/ 정적 파일 서빙
// - /api/weather, /api/news 프록시 (API 키는 .env 환경 변수에서만 읽음)
// 실행: npm start  (= node --env-file=.env server.js)

const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const PORT = Number(process.env.PORT) || 3000;
const { OPENWEATHER_API_KEY, NEWS_API_KEY } = process.env;
const PUBLIC_DIR = path.join(__dirname, "public");
const CACHE_TTL_MS = 10 * 60 * 1000; // 10분

const LOCATIONS = [
  { name: "서울", lat: 37.5665, lon: 126.978 },
  { name: "용인시 기흥구", lat: 37.2803, lon: 127.1146 },
];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

class ApiError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

// ---------- 메모리 캐시 ----------
const cache = new Map();

async function cached(key, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < CACHE_TTL_MS) return hit.data;
  const data = await loader();
  cache.set(key, { time: Date.now(), data });
  return data;
}

// ---------- 외부 API 호출 ----------
async function fetchJson(url, serviceName) {
  let res;
  try {
    res = await fetch(url, { headers: { "User-Agent": "weather-news-dashboard/1.0" } });
  } catch {
    throw new ApiError(`${serviceName} 서버에 연결할 수 없습니다.`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      throw new ApiError(
        `${serviceName} API 키가 유효하지 않습니다. (신규 키는 활성화까지 수 시간이 걸릴 수 있습니다)`
      );
    }
    if (res.status === 429) throw new ApiError(`${serviceName} 호출 한도를 초과했습니다.`);
    throw new ApiError(`${serviceName} 오류: ${body.message || res.status}`);
  }
  return body;
}

async function getWeather() {
  if (!OPENWEATHER_API_KEY) throw new ApiError("OPENWEATHER_API_KEY가 .env에 설정되지 않았습니다.", 500);

  return Promise.all(
    LOCATIONS.map(async ({ name, lat, lon }) => {
      const url =
        "https://api.openweathermap.org/data/2.5/weather" +
        `?lat=${lat}&lon=${lon}&units=metric&lang=kr&appid=${OPENWEATHER_API_KEY}`;
      const d = await fetchJson(url, "OpenWeather");
      return {
        name,
        temp: d.main.temp,
        feelsLike: d.main.feels_like,
        tempMin: d.main.temp_min,
        tempMax: d.main.temp_max,
        humidity: d.main.humidity,
        windSpeed: d.wind.speed,
        description: d.weather[0]?.description ?? "",
        icon: d.weather[0]?.icon ?? "01d",
        updatedAt: d.dt,
      };
    })
  );
}

function toArticles(articles) {
  return articles
    .filter((a) => a.title && a.title !== "[Removed]" && a.url)
    .slice(0, 10)
    .map((a) => ({
      title: a.title,
      source: a.source?.name ?? "",
      url: a.url,
      image: a.urlToImage || null,
      publishedAt: a.publishedAt,
    }));
}

async function getNews() {
  if (!NEWS_API_KEY) throw new ApiError("NEWS_API_KEY가 .env에 설정되지 않았습니다.", 500);

  const topUrl = `https://newsapi.org/v2/top-headlines?country=kr&pageSize=20&apiKey=${NEWS_API_KEY}`;
  const top = toArticles((await fetchJson(topUrl, "NewsAPI")).articles ?? []);
  if (top.length > 0) return top;

  // country=kr 결과가 비어 있을 때 대체 쿼리 (PRD 8장)
  const q = encodeURIComponent("한국 OR 서울 OR 정부 OR 경제");
  const fallbackUrl =
    `https://newsapi.org/v2/everything?q=${q}&sortBy=publishedAt&pageSize=30&apiKey=${NEWS_API_KEY}`;
  const hangul = /[가-힣]/;
  const articles = (await fetchJson(fallbackUrl, "NewsAPI")).articles ?? [];
  return toArticles(articles.filter((a) => hangul.test(a.title ?? "")));
}

// ---------- HTTP 서버 ----------
function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": MIME[".json"], "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

async function serveStatic(res, pathname) {
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const content = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("404 Not Found");
  }
}

const routes = {
  "/api/weather": () => cached("weather", getWeather),
  "/api/news": () => cached("news", getNews),
};

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);

  if (req.method !== "GET") {
    res.writeHead(405).end("Method Not Allowed");
    return;
  }

  const route = routes[pathname];
  if (route) {
    try {
      sendJson(res, 200, await route());
    } catch (err) {
      console.error(`[${pathname}]`, err.message);
      sendJson(res, err.status || 500, { error: err.message || "서버 오류가 발생했습니다." });
    }
    return;
  }

  await serveStatic(res, decodeURIComponent(pathname));
});

server.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
  if (!OPENWEATHER_API_KEY) console.warn("⚠️  OPENWEATHER_API_KEY가 설정되지 않았습니다.");
  if (!NEWS_API_KEY) console.warn("⚠️  NEWS_API_KEY가 설정되지 않았습니다.");
});
