#!/bin/bash
# Claude OAuth access token 갱신 (cron용, 매시간 실행)
#
# 토큰 소스 우선순위:
# 1. credentials.json의 refreshToken으로 OAuth refresh (가능한 경우)
# 2. Claude Code 세션이 sync-oauth-token.sh hook으로 갱신한 토큰 사용
# 3. 백업에서 복원
#
# 핵심: credentials.json은 Bridge가 ANTHROPIC_API_KEY로 읽는 파일
# Claude Code 세션 시작 시 hook이 자동으로 최신 토큰 동기화

LOG_FILE="$HOME/.claude/token-refresh.log"
CRED_FILE="$HOME/.claude/.credentials.json"
BACKUP_FILE="$HOME/.claude/backups/.credentials.backup.json"
LOCK_FILE="/tmp/claude-token-refresh.lock"

# OAuth 설정
TOKEN_URL="https://platform.claude.com/v1/oauth/token"
CLIENT_ID="9d1c250a-e61b-44d9-88ed-5944d1962f5e"
DEFAULT_SCOPES="user:file_upload user:inference user:mcp_servers user:profile user:sessions:claude_code"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

mkdir -p "$(dirname "$BACKUP_FILE")"

# ── 동시 실행 방지 ──
if command -v flock >/dev/null 2>&1; then
  exec 200>"$LOCK_FILE"
  flock -n 200 || { log "SKIP: another refresh running"; exit 0; }
else
  if command -v shlock >/dev/null 2>&1; then
    shlock -f "${LOCK_FILE}.shlock" -p $$ || { log "SKIP: another refresh running"; exit 0; }
    trap 'rm -f "${LOCK_FILE}.shlock"' EXIT
  fi
fi

# ── credentials.json 복원 ──
if [ ! -f "$CRED_FILE" ]; then
  if [ -f "$BACKUP_FILE" ]; then
    cp "$BACKUP_FILE" "$CRED_FILE"
    log "RESTORED: credentials.json from backup"
  else
    log "SKIP: no credentials file or backup"
    exit 0
  fi
fi

# ── 현재 토큰 정보 읽기 ──
CRED_DATA=$(python3 -c "
import json
c = json.load(open('$CRED_FILE'))['claudeAiOauth']
print(c.get('refreshToken',''))
print(c.get('expiresAt',0))
scopes = c.get('scopes', [])
print(' '.join(scopes) if scopes else '')
" 2>/dev/null)

REFRESH_TOKEN=$(echo "$CRED_DATA" | sed -n '1p')
EXPIRES_AT=$(echo "$CRED_DATA" | sed -n '2p')
SCOPES=$(echo "$CRED_DATA" | sed -n '3p')
[ -z "$SCOPES" ] && SCOPES="$DEFAULT_SCOPES"

NOW_MS=$(python3 -c "import time; print(int(time.time()*1000))")
REMAINING_MS=$((EXPIRES_AT - NOW_MS))
REMAINING_MIN=$((REMAINING_MS / 60000))

log "remaining=${REMAINING_MIN}min refreshToken=$([ -n \"$REFRESH_TOKEN\" ] && echo 'yes' || echo 'no')"

# ── 유효한 토큰이면 백업 ──
if [ "$REMAINING_MS" -gt 0 ]; then
  cp "$CRED_FILE" "$BACKUP_FILE"
fi

# ── refresh_token이 없으면 갱신 불가 → 상태 보고만 ──
if [ -z "$REFRESH_TOKEN" ]; then
  if [ "$REMAINING_MS" -le 0 ]; then
    log "EXPIRED: no refresh_token — waiting for Claude Code session to sync new token"
  elif [ "$REMAINING_MIN" -lt 120 ]; then
    log "WARNING: ${REMAINING_MIN}min left, no refresh_token — new Claude Code session needed soon"
  else
    log "OK: still valid (no refresh_token, relying on session sync)"
  fi
  exit 0
fi

# ── OAuth refresh (refresh_token이 있는 경우) ──
REFRESH_THRESHOLD_MS=14400000  # 4시간

do_refresh() {
  curl -s -X POST "$TOKEN_URL" \
    -H "Content-Type: application/json" \
    -d "{\"grant_type\":\"refresh_token\",\"refresh_token\":\"$REFRESH_TOKEN\",\"client_id\":\"$CLIENT_ID\",\"scope\":\"$SCOPES\"}" \
    --max-time 15 2>/dev/null
}

apply_refresh() {
  local RESULT="$1"
  python3 -c "
import json, sys, time, shutil

result = json.loads('''$RESULT''')

if 'access_token' not in result:
    error = result.get('error', {})
    msg = error.get('message', json.dumps(error)) if isinstance(error, dict) else str(error)
    print(f'ERROR: {msg}', file=sys.stderr)
    sys.exit(1)

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
shutil.copy2('$CRED_FILE', '$BACKUP_FILE')

remaining_min = result['expires_in'] // 60
print(f'OK: refreshed, new expiry in {remaining_min}min')
" 2>&1
}

needs_refresh=false
if [ "$REMAINING_MS" -le 0 ]; then
  log "EXPIRED! trying OAuth refresh..."
  needs_refresh=true
elif [ "$REMAINING_MS" -lt "$REFRESH_THRESHOLD_MS" ]; then
  log "refreshing (${REMAINING_MIN}min left)..."
  needs_refresh=true
else
  log "OK: still valid"
fi

if [ "$needs_refresh" = true ]; then
  RESULT=$(do_refresh)
  if [ -z "$RESULT" ]; then
    log "FAIL: no response from token endpoint"
  elif echo "$RESULT" | grep -qi "rate"; then
    # rate limited → jitter 재시도
    JITTER=$((RANDOM % 30 + 10))
    log "RATE LIMITED, retry in ${JITTER}s..."
    sleep "$JITTER"
    RESULT=$(do_refresh)
    APPLY_RESULT=$(apply_refresh "$RESULT" 2>&1)
    if [ $? -eq 0 ]; then
      log "RETRY OK: $APPLY_RESULT"
    else
      log "RETRY FAIL: $APPLY_RESULT"
    fi
  else
    APPLY_RESULT=$(apply_refresh "$RESULT" 2>&1)
    if [ $? -eq 0 ]; then
      log "$APPLY_RESULT"
    else
      log "FAIL: $APPLY_RESULT"
    fi
  fi
fi

# ── 로그 크기 관리 ──
if [ -f "$LOG_FILE" ] && [ "$(wc -c < "$LOG_FILE")" -gt 102400 ]; then
  tail -100 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
fi
