#!/bin/bash
# Claude OAuth access token 사전 갱신 (cron용)
# refresh token으로 직접 Anthropic OAuth endpoint 호출 — CLI 실행 불필요
# apiKeyHelper(get-claude-token.sh)가 실시간 fallback, 이건 사전 예방용 안전장치

LOG_FILE="$HOME/.claude/token-refresh.log"
CRED_FILE="$HOME/.claude/.credentials.json"
CLIENT_ID="9d1c250a-e61b-44d9-88ed-5944d1962f5e"
TOKEN_URL="https://platform.claude.com/v1/oauth/token"

# 현재 토큰 만료 시간 확인
EXPIRES_AT=$(python3 -c "import json; print(json.load(open('$CRED_FILE'))['claudeAiOauth']['expiresAt'])" 2>/dev/null)
NOW_MS=$(python3 -c "import time; print(int(time.time()*1000))")
REMAINING_MS=$((EXPIRES_AT - NOW_MS))
REMAINING_MIN=$((REMAINING_MS / 60000))

echo "[$(date '+%Y-%m-%d %H:%M:%S')] token expires in ${REMAINING_MIN}min" >> "$LOG_FILE"

# 만료 2시간 전부터 갱신 시도
if [ "$REMAINING_MS" -lt 7200000 ]; then
  REFRESH_TOKEN=$(python3 -c "import json; print(json.load(open('$CRED_FILE'))['claudeAiOauth']['refreshToken'])" 2>/dev/null)

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] refreshing token via OAuth..." >> "$LOG_FILE"

  RESPONSE=$(curl -s --max-time 15 -X POST "$TOKEN_URL" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode "grant_type=refresh_token" \
    --data-urlencode "refresh_token=${REFRESH_TOKEN}" \
    --data-urlencode "client_id=${CLIENT_ID}" 2>/dev/null)

  # pipe로 안전하게 전달
  RESULT=$(echo "$RESPONSE" | python3 -c "
import json, time, sys
try:
    r = json.load(sys.stdin)
    if 'access_token' not in r:
        print(f'FAIL: {r.get(\"error\",{}).get(\"type\",\"unknown\")}')
        sys.exit(1)
    creds = json.load(open(sys.argv[1]))
    creds['claudeAiOauth']['accessToken'] = r['access_token']
    creds['claudeAiOauth']['expiresAt'] = int(time.time()*1000) + r.get('expires_in', 28800) * 1000
    if 'refresh_token' in r:
        creds['claudeAiOauth']['refreshToken'] = r['refresh_token']
    json.dump(creds, open(sys.argv[1], 'w'))
    remaining_h = r.get('expires_in', 28800) / 3600
    print(f'OK: new token valid for {remaining_h:.1f}h')
except Exception as e:
    print(f'FAIL: {e}')
    sys.exit(1)
" "$CRED_FILE" 2>&1)

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $RESULT" >> "$LOG_FILE"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] token still valid, skipping refresh" >> "$LOG_FILE"
fi

# 로그 파일 크기 관리 (100KB 초과 시 truncate)
if [ -f "$LOG_FILE" ] && [ "$(wc -c < "$LOG_FILE")" -gt 102400 ]; then
  tail -100 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
fi
