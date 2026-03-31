#!/bin/bash
# apiKeyHelper: Claude --bare 모드에서 유효한 OAuth access token 제공
# 1. .credentials.json에서 토큰 읽기
# 2. 만료 2시간 전이면 refresh token으로 직접 갱신
# 3. stdout으로 access token 출력 (apiKeyHelper 규약)

CRED_FILE="$HOME/.claude/.credentials.json"
LOCK_FILE="/tmp/claude-token-refresh.lock"
CLIENT_ID="9d1c250a-e61b-44d9-88ed-5944d1962f5e"
TOKEN_URL="https://platform.claude.com/v1/oauth/token"
REFRESH_THRESHOLD_MS=7200000  # 2시간

# .credentials.json 읽기
read_creds() {
  python3 -c "
import json, sys
c = json.load(open('$CRED_FILE'))['claudeAiOauth']
print(c['accessToken'])
print(c.get('refreshToken',''))
print(c.get('expiresAt',0))
" 2>/dev/null
}

CREDS=$(read_creds)
ACCESS_TOKEN=$(echo "$CREDS" | sed -n '1p')
REFRESH_TOKEN=$(echo "$CREDS" | sed -n '2p')
EXPIRES_AT=$(echo "$CREDS" | sed -n '3p')
NOW_MS=$(python3 -c "import time; print(int(time.time()*1000))")
REMAINING_MS=$((EXPIRES_AT - NOW_MS))

# 토큰이 아직 유효하면 바로 반환
if [ "$REMAINING_MS" -gt "$REFRESH_THRESHOLD_MS" ]; then
  echo "$ACCESS_TOKEN"
  exit 0
fi

# 만료 임박 — refresh 시도 (lock으로 동시 실행 방지)
if [ -f "$LOCK_FILE" ]; then
  # 다른 프로세스가 refresh 중 — 기존 토큰 반환
  echo "$ACCESS_TOKEN"
  exit 0
fi

touch "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

RESPONSE=$(curl -s --max-time 10 -X POST "$TOKEN_URL" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "grant_type=refresh_token" \
  --data-urlencode "refresh_token=${REFRESH_TOKEN}" \
  --data-urlencode "client_id=${CLIENT_ID}" 2>/dev/null)

# 응답 파싱 + .credentials.json 업데이트
NEW_TOKEN=$(echo "$RESPONSE" | python3 -c "
import sys, json, time
try:
    r = json.load(sys.stdin)
    if 'access_token' not in r:
        sys.exit(1)
    new_access = r['access_token']
    expires_in = r.get('expires_in', 28800)
    new_refresh = r.get('refresh_token', '')

    # .credentials.json 업데이트
    creds = json.load(open('$CRED_FILE'))
    creds['claudeAiOauth']['accessToken'] = new_access
    creds['claudeAiOauth']['expiresAt'] = int(time.time()*1000) + expires_in * 1000
    if new_refresh:
        creds['claudeAiOauth']['refreshToken'] = new_refresh
    json.dump(creds, open('$CRED_FILE', 'w'))

    print(new_access)
except:
    sys.exit(1)
" 2>/dev/null)

if [ $? -eq 0 ] && [ -n "$NEW_TOKEN" ]; then
  echo "$NEW_TOKEN"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] apiKeyHelper: token refreshed via OAuth" >> "$HOME/.claude/token-refresh.log"
else
  # refresh 실패 — 기존 토큰 반환 (아직 유효할 수 있음)
  echo "$ACCESS_TOKEN"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] apiKeyHelper: refresh failed, using existing token (${REMAINING_MS}ms left)" >> "$HOME/.claude/token-refresh.log"
fi
