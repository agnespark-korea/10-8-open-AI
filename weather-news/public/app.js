// 프론트엔드: 우리 서버의 /api/* 만 호출한다. (API 키는 서버에만 존재)

const weatherEl = document.getElementById("weather");
const newsEl = document.getElementById("news");
const refreshBtn = document.getElementById("refresh");

// 요소 생성 헬퍼 — 외부 문자열은 항상 textContent로 넣어 XSS를 막는다.
function el(tag, { className, text, attrs } = {}, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

function showMessage(container, message, isError = false) {
  container.replaceChildren(el("p", { className: isError ? "error" : "status", text: message }));
}

async function getJson(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `요청 실패 (HTTP ${res.status})`);
  return data;
}

function relativeTime(iso) {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (Number.isNaN(diffMin)) return "";
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  return `${Math.floor(diffHour / 24)}일 전`;
}

// ---------- 날씨 ----------
function weatherCard(w) {
  const stat = (label, value) => [el("dt", { text: label }), el("dd", { text: value })];
  const updated = new Date(w.updatedAt * 1000).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return el("article", { className: "card" }, [
    el("div", { className: "weather-head" }, [
      el("h3", { text: w.name }),
      el("img", {
        attrs: {
          src: `https://openweathermap.org/img/wn/${w.icon}@2x.png`,
          alt: w.description,
        },
      }),
    ]),
    el("div", { className: "temp", text: `${Math.round(w.temp)}°C` }),
    el("div", { className: "desc", text: w.description }),
    el("dl", { className: "stats" }, [
      ...stat("체감 온도", `${Math.round(w.feelsLike)}°C`),
      ...stat("최고 / 최저", `${Math.round(w.tempMax)}° / ${Math.round(w.tempMin)}°`),
      ...stat("습도", `${w.humidity}%`),
      ...stat("풍속", `${w.windSpeed} m/s`),
    ]),
    el("div", { className: "updated", text: `기준 시각 ${updated}` }),
  ]);
}

async function loadWeather() {
  showMessage(weatherEl, "불러오는 중…");
  try {
    const list = await getJson("/api/weather");
    weatherEl.replaceChildren(...list.map(weatherCard));
  } catch (err) {
    showMessage(weatherEl, `날씨 정보를 가져오지 못했습니다: ${err.message}`, true);
  }
}

// ---------- 뉴스 ----------
function newsItem(a) {
  const children = [
    el("div", { className: "news-body" }, [
      el("a", { text: a.title, attrs: { href: a.url, target: "_blank", rel: "noopener noreferrer" } }),
      el("div", {
        className: "news-meta",
        text: [a.source, relativeTime(a.publishedAt)].filter(Boolean).join(" · "),
      }),
    ]),
  ];

  if (a.image) {
    const img = el("img", { className: "news-thumb", attrs: { src: a.image, alt: "", loading: "lazy" } });
    img.addEventListener("error", () => img.remove()); // 깨진 이미지는 숨김
    children.push(img);
  }

  return el("li", { className: "news-item" }, children);
}

async function loadNews() {
  showMessage(newsEl, "불러오는 중…");
  try {
    const articles = await getJson("/api/news");
    if (articles.length === 0) {
      showMessage(newsEl, "표시할 뉴스가 없습니다.");
      return;
    }
    newsEl.replaceChildren(el("ol", { className: "news-list" }, articles.map(newsItem)));
  } catch (err) {
    showMessage(newsEl, `뉴스를 가져오지 못했습니다: ${err.message}`, true);
  }
}

// ---------- 초기화 ----------
async function loadAll() {
  refreshBtn.disabled = true;
  // 한쪽이 실패해도 다른 쪽은 표시되도록 각각 독립적으로 처리
  await Promise.allSettled([loadWeather(), loadNews()]);
  refreshBtn.disabled = false;
}

refreshBtn.addEventListener("click", loadAll);
loadAll();
