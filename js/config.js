// 점수판 백엔드 설정 (Supabase)
// 1. https://supabase.com 에서 무료 프로젝트를 만듭니다.
// 2. SQL Editor에서 supabase/schema.sql 내용을 실행합니다.
// 3. Project Settings > API 에서 Project URL 과 anon public key 를 아래에 붙여넣습니다.
//    anon key 는 공개용 키이며, 테이블은 RLS 로 읽기/추가만 허용되어 있습니다.
// 값이 비어 있으면 점수는 이 브라우저(localStorage)에만 저장됩니다.
window.CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  TABLE: "scores",
  TOP_N: 10,
};
