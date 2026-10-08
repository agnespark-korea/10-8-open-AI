# 오늘의 날씨 & 뉴스

서울·용인시 기흥구 날씨(OpenWeather)와 한국어 뉴스 헤드라인 10개(NewsAPI.org)를 보여주는 바닐라 JS 웹앱입니다.
API 키는 서버 환경 변수(`.env`)에만 저장되고, 브라우저에는 노출되지 않습니다.

## 실행 방법

1. Node.js 20.6 이상 설치 (`node --version`으로 확인)
2. API 키 발급
   - OpenWeather: https://home.openweathermap.org/api_keys (신규 키는 활성화까지 수 시간 걸릴 수 있음)
   - NewsAPI: https://newsapi.org/register
3. `.env.example`을 복사해 `.env`를 만들고 키 입력
   ```bash
   cp .env.example .env
   ```
4. 서버 실행
   ```bash
   npm start
   ```
5. 브라우저에서 http://localhost:3000 접속

외부 npm 패키지를 쓰지 않으므로 `npm install`은 필요 없습니다.

## 구조

```
server.js        정적 파일 서빙 + /api/weather, /api/news 프록시 (10분 캐시)
public/
  index.html
  style.css
  app.js         /api/* 호출 후 화면 렌더링
.env             실제 API 키 (Git 제외)
.env.example     필요한 환경 변수 목록
```
