#!/bin/bash
# apiKeyHelper: Claude --bare 모드에서 유효한 OAuth access token 제공
# 1. .credentials.json에서 토큰 읽기 (없으면 백업에서 복원)
# 2. 만료 2시간 전이면 직접 OAuth refresh (rate limit 백오프 포함)
# 3. stdout으로 access token 출력 (apiKeyHelper 규약)

CRED_FILE="$HOME/.claude/.credentials.json"
BACKUP_FILE="$HOME/.claude/backups/.credentials.backup.json"
LOCK_FILE="/tmp/claude-token-refresh.lock"
BACKOFF_FILE="/tmp/claude-token-refresh-backoff"
BACKOFF_SECONDS=600  # rate limit 시 10분 백오프 (기존 30분 → 단축)
REFRESH_THRESHOLD_MS=7200000  # 2시간
LOG_FILE="$HOME/.claude/token-refresh.log"

# OAuth 설정 (CLI 바이너리에서 추출)
TOKEN_URL="https://platform.claude.com/v1/oauth/token"
CLIENT_ID="9d1c250a-e61b-44d9-88ed-5944d1962f5e"
DEFAULT_SCOPES="user:file_upload user:inference user:mcp_servers user:profile user:sessions:claude_code"

# ── credentials.json 복원 ──
if [ ! -f "$CRED_FILE" ]; then
  if [ -f "$BACKUP_FILE" ]; then
    cp "$BACKUP_FILE" "$CRED_FILE"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] apiKeyHelper: RESTORED credentials from backup" >> "$LOG_FILE"
  else
    echo "TOKEN_EXPIRED" >&2
    exit 1
  fi
fi

# .credentials.json 읽기
read_creds() {
  python3 -c "
import json, sys
c = json.load(open('$CRED_FILE'))['claudeAiOauth']
print(c['accessToken'])
print(c.get('refreshToken',''))
print(c.get('expiresAt',0))
scopes = c.get('scopes', [])
print(' '.join(scopes) if scopes else '')
" 2>/dev/null
}

CREDS=$(read_creds)
ACCESS_TOKEN=$(echo "$CREDS" | sed -n '1p')
REFRESH_TOKEN=$(echo "$CREDS" | sed -n '2p')
EXPIRES_AT=$(echo "$CREDS" | sed -n '3p')
SCOPES=$(echo "$CREDS" | sed -n '4p')
[ -z "$SCOPES" ] && SCOPES="$DEFAULT_SCOPES"
NOW_MS=$(python3 -c "import time; print(int(time.time()*1000))")
REMAINING_MS=$((EXPIRES_AT - NOW_MS))

# 토큰이 아직 충분히 유효하면 바로 반환
if [ "$REMAINING_MS" -gt "$REFRESH_THRESHOLD_MS" ]; then
  echo "$ACCESS_TOKEN"
  exit 0
fi

# 백오프 체크 — 최근 갱신 실패했으면 기존 토큰 반환 (재시도 안 함)
if [ -f "$BACKOFF_FILE" ]; then
  BACKOFF_AGE=$(( $(date +%s) - $(stat -f %m "$BACKOFF_FILE" 2>/dev/null || echo 0) ))
  if [ "$BACKOFF_AGE" -lt "$BACKOFF_SECONDS" ]; then
    if [ "$REMAINING_MS" -gt 0 ]; then
      echo "$ACCESS_TOKEN"
      exit 0
    else
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] apiKeyHelper: EXPIRED + backoff active (${BACKOFF_AGE}s/${BACKOFF_SECONDS}s)" >> "$LOG_FILE"
      echo "TOKEN_EXPIRED" >&2
      exit 1
    fi
  else
    rm -f "$BACKOFF_FILE"
  fi
fi

# 동시 실행 방지 — 크론 refresh와 경쟁하지 않도록
if [ -f "$LOCK_FILE" ]; then
  LOCK_AGE=$(( $(date +%s) - $(stat -f %m "$LOCK_FILE" 2>/dev/null || echo 0) ))
  if [ "$LOCK_AGE" -lt 60 ]; then
    if [ "$REMAINING_MS" -gt 0 ]; then
      echo "$ACCESS_TOKEN"
    else
      echo "TOKEN_EXPIRED" >&2
      exit 1
    fi
    exit 0
  fi
  rm -f "$LOCK_FILE"
fi

touch "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

# 직접 OAuth refresh
RESULT=$(curl -s -X POST "$TOKEN_URL" \
  -H "Content-Type: application/json" \
  -d "{\"grant_type\":\"refresh_token\",\"refresh_token\":\"$REFRESH_TOKEN\",\"client_id\":\"$CLIENT_ID\",\"scope\":\"$SCOPES\"}" \
  --max-time 15 2>/dev/null)

if [ -n "$RESULT" ]; then
  NEW_TOKEN=$(python3 -c "
import json, sys, time

result = json.loads('''$RESULT''')

if 'access_token' not in result:
    sys.exit(1)

# credentials.json 업데이트
with open('$CRED_FILE', 'r') as f:
    creds = json.load(f)

oauth = creds['claudeAiOauth']
oauth['accessToken'] = result['access_token']
if 'refresh_token' in result:
    oauth['refreshToken'] = result['refresh_token']
oauth['expiresAt'] = int(time.time() * 1000) + result['expires_in'] * 1000
if 'scope' in result:
    oauth['scopes'] = result['scope'].split()

with open('$CRED_FILE', 'w') as f:
    json.dump(creds, f)

# 백업도 즉시 갱신
import shutil
shutil.copy2('$CRED_FILE', '$BACKUP_FILE')

print(result['access_token'])
" 2>/dev/null)

  if [ -n "$NEW_TOKEN" ]; then
    echo "$NEW_TOKEN"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] apiKeyHelper: token refreshed via OAuth" >> "$LOG_FILE"
    exit 0
  fi
fi

# OAuth refresh 실패 — 백오프 설정
touch "$BACKOFF_FILE"

if [ "$REMAINING_MS" -gt 0 ]; then
  echo "$ACCESS_TOKEN"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] apiKeyHelper: OAuth refresh failed, using existing token (${REMAINING_MS}ms left)" >> "$LOG_FILE"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] apiKeyHelper: EXPIRED, OAuth refresh failed. Run: claude setup-token" >> "$LOG_FILE"
  echo "TOKEN_EXPIRED" >&2
  exit 1
fi
