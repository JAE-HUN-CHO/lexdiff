# Lessons Learned

| 상황 | 실수 | 교훈 | 방지 규칙 |
|------|------|------|----------|
| pre-evidence 도입 시 moderate 쿼리 | "즉답 모드" 지시문 + 턴 제한(5턴)을 moderate에도 적용 → Claude가 불충분한 데이터로 38자 답변 생성 | simple과 moderate의 pre-evidence 전략은 달라야 함. simple은 "즉답", moderate는 "참고자료+적극 보충" | moderate+evidence는 턴 제한 풀고 "참고자료 모드" 지시문 사용 |
| consequence pre-evidence | 쿼리에서 법명 추출 시 `/([\w가-힣]+법)/` 사용 → "해고예고수당 벌칙"에는 "법"이 없어서 miss | 법명은 쿼리가 아닌 search_ai_law 결과에서 추출해야 함 | pre-evidence 보충 시 `aiSearch.result.match(/📜\s+(.+)/)` 우선 사용 |
| Gemini auto-chain | functionCall 파트를 수동 생성(`{ functionCall: { name, args } }`)하여 모델 메시지에 추가 | Gemini 2.5 Flash는 thought_signature 필수 — 수동 생성 파트에는 없어서 400 에러 | auto-chain 결과는 functionCall 위장 대신 텍스트(`[보충 조회: ...]`)로 주입 |
| inferComplexity | "벌칙", "요건", "비과세" 등이 moderate 패턴에 없어서 simple로 분류 → pre-evidence 3턴으로 답변 부족 | 법적 판단이 필요한 queryType(consequence, exemption, requirement)은 최소 moderate | moderatePatterns에 벌칙/처벌/과태료/면제/비과세/요건 추가 |
